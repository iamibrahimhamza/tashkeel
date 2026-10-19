import { Injectable } from "@nestjs/common";
import type { PayoutDetails, PayoutDto, PayoutStatus } from "@tashkeel/contracts";
import { encryptJson, decryptJson, ledger, maskTail, minPayout, payoutMachine } from "@tashkeel/core";
import type { Payout, PayoutProfile, Tx } from "@tashkeel/db";
import { DomainError, Errors } from "../../common/errors";
import { PrismaService } from "../../common/prisma.service";
import { env } from "../../config/env";
import { LedgerService } from "./ledger.service";

export function payoutDto(p: Payout): PayoutDto {
  return {
    id: p.id,
    amountMinor: p.amountMinor.toString(),
    currency: p.currency,
    method: p.method,
    status: p.status,
    providerRef: p.providerRef,
    createdAt: p.createdAt.toISOString(),
  };
}

function hintOf(d: PayoutDetails): string {
  switch (d.method) {
    case "AL_BARAKA": return maskTail(d.accountNumber);
    case "SHAM_CASH": return maskTail(d.walletId);
    case "WALLET": return `${d.provider} ${maskTail(d.address)}`;
    case "BANK_WIRE": return maskTail(d.iban);
    case "STRIPE_CONNECT": return "Stripe";
  }
}

const key = () => {
  const k = env().PAYOUT_ENCRYPTION_KEY;
  if (!k) throw new DomainError("INTERNAL", 503, "Payouts are not configured on this server", "السحب غير مفعّل على هذا الخادم");
  return k;
};

type TransitionMeta = { actorId: string | null; note?: string; providerRef?: string; receiptKey?: string; reason?: string };

/**
 * Payout lifecycle. Money moves only through the ledger:
 *   request   AVAILABLE → IN_TRANSIT
 *   paid      IN_TRANSIT → (cash leaves CUSTOMER_FUNDS)
 *   failed / cancelled   IN_TRANSIT → AVAILABLE
 * Manual rails (Al Baraka, Sham Cash, wallets, wires) are executed by staff, who record the
 * transfer reference; the same transitions can arrive from a provider's signed callback.
 */
@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async createProfile(workspaceId: string, input: { label: string; details: PayoutDetails; isDefault: boolean }) {
    if (input.details.method === "STRIPE_CONNECT") {
      throw new DomainError("VALIDATION_ERROR", 422, "Stripe Connect onboarding is not enabled yet", "الربط مع Stripe Connect غير متاح بعد");
    }
    const db = this.prisma.db;
    const profile = await db.$transaction(async (tx) => {
      if (input.isDefault) await tx.payoutProfile.updateMany({ where: { workspaceId }, data: { isDefault: false } });
      return tx.payoutProfile.create({
        data: {
          workspaceId,
          method: input.details.method,
          label: input.label,
          maskedHint: hintOf(input.details),
          detailsEncrypted: encryptJson(input.details, key()),
          isDefault: input.isDefault,
        },
      });
    });
    return this.profileDto(profile);
  }

  async listProfiles(workspaceId: string) {
    const rows = await this.prisma.db.payoutProfile.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
    return rows.map((p) => this.profileDto(p));
  }

  /** Never returns account details — only the masked hint. */
  profileDto(p: PayoutProfile) {
    return { id: p.id, method: p.method, label: p.label, maskedHint: p.maskedHint, isDefault: p.isDefault, isVerified: !!p.verifiedAt };
  }

  /** Staff only: full details are needed to execute a manual transfer. Callers audit-log it. */
  revealDetails(p: PayoutProfile): PayoutDetails {
    return decryptJson<PayoutDetails>(p.detailsEncrypted, key());
  }

  async request(workspaceId: string, actorId: string, input: { profileId: string; amountMinor: bigint; currency: string }, idempotencyKey: string): Promise<PayoutDto> {
    const db = this.prisma.db;
    const profile = await db.payoutProfile.findFirst({ where: { id: input.profileId, workspaceId } });
    if (!profile) throw Errors.notFound("Payout profile");
    const min = minPayout(input.currency);
    if (input.amountMinor < min) {
      throw new DomainError("VALIDATION_ERROR", 422, `Minimum payout is ${min} minor units`, "المبلغ أقل من الحد الأدنى للسحب", { minimumMinor: min.toString() });
    }

    const payout = await db.$transaction(async (tx) => {
      // Serializes concurrent requests for this workspace so two can't spend the same balance.
      await this.ledger.lockAvailable(tx, workspaceId, input.currency);
      const bal = await this.ledger.balance(tx, workspaceId, input.currency);
      if (bal.available < input.amountMinor) {
        throw new DomainError("INSUFFICIENT_BALANCE", 422, "Amount exceeds available balance", "المبلغ أكبر من الرصيد المتاح", { availableMinor: bal.available.toString() });
      }
      const p = await tx.payout.create({
        data: { workspaceId, profileId: profile.id, amountMinor: input.amountMinor, currency: input.currency, method: profile.method, idempotencyKey },
      });
      await this.ledger.post(tx, ledger.payoutRequested({ payoutId: p.id, amountMinor: p.amountMinor }), { workspaceId, currency: p.currency });
      await tx.payoutEvent.create({ data: { payoutId: p.id, to: "REQUESTED", actorId } });
      await tx.auditLog.create({ data: { actorId, workspaceId, action: "payout.request", target: p.id, data: { amountMinor: p.amountMinor.toString(), currency: p.currency, method: p.method } } });
      return p;
    });
    return payoutDto(payout);
  }

  /** The single place payout status changes. Idempotent: repeating the current status is a no-op. */
  async transition(payoutId: string, to: PayoutStatus, meta: TransitionMeta): Promise<PayoutDto> {
    const payout = await this.prisma.db.$transaction(async (tx) => {
      const current = await this.lock(tx, payoutId);
      if (current.status === to) return current;
      payoutMachine.assert(current.status, to);
      if (to === "PAID" && !meta.providerRef) throw new DomainError("VALIDATION_ERROR", 422, "A transfer reference is required to mark a payout paid");

      const updated = await tx.payout.update({
        where: { id: current.id },
        data: {
          status: to,
          ...(meta.providerRef ? { providerRef: meta.providerRef } : {}),
          ...(meta.receiptKey ? { receiptKey: meta.receiptKey } : {}),
          ...(meta.reason ? { failureReason: meta.reason } : {}),
        },
      });
      const scope = { workspaceId: current.workspaceId, currency: current.currency };
      if (to === "PAID") await this.ledger.post(tx, ledger.payoutPaid({ payoutId: current.id, amountMinor: current.amountMinor }), scope);
      if (to === "FAILED" || to === "CANCELLED") await this.ledger.post(tx, ledger.payoutFailed({ payoutId: current.id, amountMinor: current.amountMinor }), scope);

      await tx.payoutEvent.create({ data: { payoutId: current.id, from: current.status, to, actorId: meta.actorId, note: meta.note ?? meta.reason ?? null } });
      await tx.auditLog.create({ data: { actorId: meta.actorId, workspaceId: current.workspaceId, action: `payout.${to.toLowerCase()}`, target: current.id, data: { from: current.status, providerRef: meta.providerRef ?? null } } });

      if (to === "PAID" || to === "FAILED") {
        const owner = await tx.membership.findFirst({ where: { workspaceId: current.workspaceId, role: "OWNER" }, include: { user: { select: { email: true, locale: true } } } });
        if (owner) {
          await tx.emailOutbox.createMany({
            skipDuplicates: true,
            data: [{ dedupeKey: `payout:${to}:${current.id}`, to: owner.user.email, locale: owner.user.locale, template: to === "PAID" ? "payout_paid" : "payout_failed", data: { payoutId: current.id, amountMinor: current.amountMinor.toString(), currency: current.currency, providerRef: meta.providerRef ?? null, reason: meta.reason ?? null } }],
          });
        }
      }
      return updated;
    });
    return payoutDto(payout);
  }

  private async lock(tx: Tx, payoutId: string): Promise<Payout> {
    await tx.$queryRaw`SELECT id FROM "Payout" WHERE id = ${payoutId} FOR UPDATE`;
    const p = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!p) throw Errors.notFound("Payout");
    return p;
  }
}
