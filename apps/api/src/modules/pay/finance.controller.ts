import { Controller, Get, Headers, HttpCode, Inject, Param, Post } from "@nestjs/common";
import {
  BillingCheckoutInput,
  CreatePayoutProfileInput,
  IDEMPOTENCY_HEADER,
  LedgerQuery,
  OrdersQuery,
  RequestPayoutInput,
  type Balance,
  type LedgerLineDto,
  type OrderDto,
} from "@tashkeel/contracts";
import { ledger } from "@tashkeel/core";
import type { z } from "zod";
import { CurrentUser, CurrentWorkspace, RequirePermission, type AuthUser, type WorkspaceContext } from "../../common/auth";
import { DomainError, Errors } from "../../common/errors";
import { Idempotent } from "../../common/idempotency";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody, ValidQuery } from "../../common/zod";
import { env } from "../../config/env";
import { LedgerService } from "./ledger.service";
import { sandboxPriceId } from "./billing.service";
import { gatewayMode, PAYMENT_GATEWAY, type PaymentGatewayAdapter } from "./gateway";
import { payoutDto, PayoutsService } from "./payouts.service";

/** Expert-facing money endpoints, all scoped to `:workspaceId` and gated by role. */
@Controller("v1/workspaces/:workspaceId")
export class FinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly payouts: PayoutsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayAdapter,
  ) {}

  @RequirePermission("payouts:read")
  @Get("balance")
  async balance(@CurrentWorkspace() ws: WorkspaceContext): Promise<{ data: Balance[] }> {
    const db = this.prisma.db;
    const currencies = await db.ledgerAccount.findMany({ where: { workspaceId: ws.id }, distinct: ["currency"], select: { currency: true } });
    const data: Balance[] = [];
    for (const { currency } of currencies) {
      const b = await this.ledger.balance(db, ws.id, currency);
      const [next] = await db.$queryRaw<Array<{ at: Date | null }>>`
        SELECT MIN(e."availableAt") AS at
        FROM "LedgerEntry" e
        JOIN "LedgerAccount" a ON a.id = e."accountId" AND a.type = 'EXPERT_PENDING' AND a."workspaceId" = ${ws.id} AND a.currency = ${currency}
        JOIN "LedgerTransaction" t ON t.id = e."transactionId" AND t.kind = 'ORDER_PAID'
        WHERE NOT EXISTS (SELECT 1 FROM "LedgerTransaction" r WHERE r.kind = 'FUNDS_RELEASED' AND r."refId" = t."refId")`;
      data.push({
        currency,
        pendingMinor: b.pending.toString(),
        availableMinor: b.available.toString(),
        inTransitMinor: b.inTransit.toString(),
        nextReleaseAt: next?.at ? new Date(next.at).toISOString() : null,
      });
    }
    return { data };
  }

  /** The expert's side of the journal, newest first (cursor = entry id). */
  @RequirePermission("payouts:read")
  @Get("ledger")
  async ledgerFeed(@CurrentWorkspace() ws: WorkspaceContext, @ValidQuery(LedgerQuery) q: z.infer<typeof LedgerQuery>): Promise<{ data: LedgerLineDto[]; nextCursor: string | null }> {
    const rows = await this.prisma.db.ledgerEntry.findMany({
      where: { account: { workspaceId: ws.id, ...(q.currency ? { currency: q.currency } : {}) } },
      include: { account: true, transaction: true },
      orderBy: [{ transaction: { createdAt: "desc" } }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return {
      data: page.map((e) => ({
        id: e.id,
        at: e.transaction.createdAt.toISOString(),
        kind: e.transaction.kind,
        refType: e.transaction.refType,
        refId: e.transaction.refId,
        account: e.account.type as LedgerLineDto["account"],
        amountMinor: ledger.displayBalance(e.account.type, e.amountMinor).toString(),
        currency: e.account.currency,
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }

  @RequirePermission("orders:read")
  @Get("orders")
  async orders(@CurrentWorkspace() ws: WorkspaceContext, @ValidQuery(OrdersQuery) q: z.infer<typeof OrdersQuery>): Promise<{ data: OrderDto[]; nextCursor: string | null }> {
    const rows = await this.prisma.db.order.findMany({
      where: { workspaceId: ws.id, ...(q.status ? { status: q.status } : {}) },
      include: { customer: { select: { email: true, name: true } }, items: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return {
      data: page.map((o) => ({
        id: o.id,
        status: o.status,
        currency: o.currency,
        subtotalMinor: o.subtotalMinor.toString(),
        platformFeeMinor: o.platformFeeMinor.toString(),
        processorFeeMinor: o.processorFeeMinor.toString(),
        netMinor: o.netMinor.toString(),
        refundedMinor: o.refundedMinor.toString(),
        customer: o.customer,
        items: o.items.map((i) => ({ title: i.title, unitPriceMinor: i.unitPriceMinor.toString(), quantity: i.quantity })),
        paidAt: o.paidAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }

  // ── Payout profiles & payouts ──

  @RequirePermission("payout-profiles:manage")
  @Get("payout-profiles")
  async profiles(@CurrentWorkspace() ws: WorkspaceContext) {
    return { data: await this.payouts.listProfiles(ws.id) };
  }

  @RequirePermission("payout-profiles:manage")
  @Post("payout-profiles")
  async createProfile(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceContext, @ValidBody(CreatePayoutProfileInput) input: z.infer<typeof CreatePayoutProfileInput>) {
    const profile = await this.payouts.createProfile(ws.id, input);
    await this.prisma.db.auditLog.create({ data: { actorId: user.id, workspaceId: ws.id, action: "payout_profile.create", target: profile.id, data: { method: profile.method } } });
    return profile;
  }

  @RequirePermission("payouts:read")
  @Get("payouts")
  async listPayouts(@CurrentWorkspace() ws: WorkspaceContext) {
    const rows = await this.prisma.db.payout.findMany({ where: { workspaceId: ws.id }, orderBy: { createdAt: "desc" }, take: 100 });
    return { data: rows.map(payoutDto) };
  }

  @RequirePermission("payouts:request")
  @Idempotent()
  @Post("payouts")
  async requestPayout(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @ValidBody(RequestPayoutInput) input: z.infer<typeof RequestPayoutInput>,
    @Headers(IDEMPOTENCY_HEADER) key: string,
  ) {
    return this.payouts.request(ws.id, user.id, { profileId: input.profileId, amountMinor: BigInt(input.amountMinor), currency: input.currency }, key);
  }

  @RequirePermission("payouts:request")
  @HttpCode(200)
  @Post("payouts/:payoutId/cancel")
  async cancelPayout(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceContext, @Param("payoutId") payoutId: string) {
    const p = await this.prisma.db.payout.findFirst({ where: { id: payoutId, workspaceId: ws.id } });
    if (!p) throw Errors.notFound("Payout");
    if (p.status !== "REQUESTED") throw Errors.conflict("Only requested payouts can be cancelled", "لا يمكن إلغاء طلب سحب قيد التنفيذ");
    return this.payouts.transition(p.id, "CANCELLED", { actorId: user.id, reason: "cancelled by expert" });
  }

  // ── SaaS subscription ──

  @RequirePermission("billing:manage")
  @Get("billing")
  async billing(@CurrentWorkspace() ws: WorkspaceContext) {
    const w = await this.prisma.db.workspace.findUniqueOrThrow({ where: { id: ws.id }, include: { subscription: true } });
    const plans = await this.prisma.db.plan.findMany({ orderBy: { monthlyMinor: "asc" } });
    return {
      planCode: w.planCode,
      subscription: w.subscription && { status: w.subscription.status, currentPeriodEnd: w.subscription.currentPeriodEnd?.toISOString() ?? null },
      plans: plans.map((p) => ({ code: p.code, name: p.name, nameAr: p.nameAr, monthlyMinor: p.monthlyMinor.toString(), currency: p.currency, feeBps: p.feeBps })),
    };
  }

  @RequirePermission("billing:manage")
  @Idempotent()
  @Post("billing/checkout")
  async billingCheckout(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @ValidBody(BillingCheckoutInput) input: z.infer<typeof BillingCheckoutInput>,
    @Headers(IDEMPOTENCY_HEADER) key: string,
  ) {
    const plan = await this.prisma.db.plan.findUnique({ where: { code: input.planCode } });
    const priceId = plan?.stripePriceId ?? (plan && gatewayMode() === "sandbox" ? sandboxPriceId(plan.code) : null);
    if (!plan || !priceId) throw new DomainError("VALIDATION_ERROR", 422, "This plan is not available for purchase yet", "هذه الخطة غير متاحة للشراء بعد");
    const w = await this.prisma.db.workspace.findUniqueOrThrow({ where: { id: ws.id }, include: { subscription: true } });
    const web = env().WEB_URL;
    const session = await this.gateway.createSubscriptionCheckout({
      workspaceId: ws.id,
      priceId,
      customerEmail: user.email,
      ...(w.subscription?.stripeCustomerId ? { customerId: w.subscription.stripeCustomerId } : {}),
      successUrl: `${web}/dashboard/${ws.id}/billing?status=success`,
      cancelUrl: `${web}/dashboard/${ws.id}/billing`,
      idempotencyKey: `billing:v1:${ws.id}:${key}`,
    });
    return { checkoutUrl: session.url };
  }
}
