import { Injectable, Logger } from "@nestjs/common";
import { bookingMachine, computeFees, ledger, orderMachine } from "@tashkeel/core";
import type { Prisma, Tx } from "@tashkeel/db";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env";
import { PrismaService } from "../../common/prisma.service";
import { LedgerService } from "./ledger.service";

/**
 * Applies payment outcomes to orders. Every method:
 *  - runs in one DB transaction and locks the order row first (SELECT … FOR UPDATE), so
 *    concurrent deliveries of the same event serialize;
 *  - re-reads state and exits early when the outcome is already applied (idempotent);
 *  - writes ledger, entitlements, CRM and outbox emails atomically with the status change.
 */
@Injectable()
export class FulfillmentService {
  private readonly log = new Logger("Fulfillment");

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async settlePaid(orderId: string, payment: { paymentIntentId: string | null; processorFeeMinor: bigint; paidAt?: Date }): Promise<"settled" | "already"> {
    return this.prisma.db.$transaction(async (tx) => {
      const order = await this.lock(tx, orderId);
      if (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED" || order.status === "REFUNDED") return "already";
      orderMachine.assert(order.status, "PAID");

      const paidAt = payment.paidAt ?? new Date();
      const fees = computeFees(order.subtotalMinor, { feeBps: order.feeBpsSnapshot, feeFixedMinor: order.feeFixedSnapshot }, payment.processorFeeMinor);
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paidAt,
          stripePaymentIntentId: payment.paymentIntentId,
          platformFeeMinor: fees.platformFeeMinor,
          processorFeeMinor: fees.processorFeeMinor,
          netMinor: fees.netMinor,
        },
      });

      if (fees.grossMinor > 0n) {
        await this.ledger.post(
          tx,
          ledger.orderPaid({ orderId: order.id, grossMinor: fees.grossMinor, platformFeeMinor: fees.platformFeeMinor, processorFeeMinor: fees.processorFeeMinor, paidAt, holdDays: env().FUNDS_HOLD_DAYS }),
          { workspaceId: order.workspaceId, currency: order.currency },
        );
      }

      const items = await tx.orderItem.findMany({ where: { orderId: order.id }, include: { booking: true } });
      const bookingsConfirmed: Array<{ id: string; startsAt: Date; endsAt: Date; customerTz: string }> = [];
      for (const item of items) {
        if (item.productId) {
          await tx.entitlement.upsert({
            where: { orderItemId: item.id },
            update: {},
            create: { userId: order.customerId, productId: item.productId, orderItemId: item.id },
          });
        }
        if (item.booking) {
          if (bookingMachine.can(item.booking.status, "CONFIRMED")) {
            await tx.booking.update({ where: { id: item.booking.id }, data: { status: "CONFIRMED", holdExpiresAt: null } });
            bookingsConfirmed.push(item.booking);
          } else if (item.booking.status !== "CONFIRMED") {
            // Paid after the hold expired and the slot was released: needs a human (refund or reschedule).
            this.log.warn(`order ${order.id} paid for booking ${item.booking.id} in status ${item.booking.status}`);
            await this.activity(tx, order.workspaceId, null, "BOOKING_PAID_AFTER_RELEASE", item.booking.id, { orderId: order.id });
          }
        }
      }

      const customer = await tx.user.findUniqueOrThrow({ where: { id: order.customerId }, select: { email: true, name: true, locale: true } });
      const contact = await tx.contact.upsert({
        where: { workspaceId_email: { workspaceId: order.workspaceId, email: customer.email } },
        update: { lastSeenAt: paidAt, lifetimeValueMinor: { increment: order.subtotalMinor }, userId: order.customerId },
        create: { workspaceId: order.workspaceId, email: customer.email, name: customer.name, userId: order.customerId, source: "purchase", lifetimeValueMinor: order.subtotalMinor },
      });
      await this.activity(tx, order.workspaceId, contact.id, "ORDER_PAID", order.id, { amountMinor: order.subtotalMinor.toString(), currency: order.currency, items: items.map((i) => i.title) });

      const owner = await tx.membership.findFirst({ where: { workspaceId: order.workspaceId, role: "OWNER" }, include: { user: { select: { email: true, locale: true } } } });
      const emailData = { orderId: order.id, amountMinor: order.subtotalMinor.toString(), currency: order.currency, items: items.map((i) => i.title) };
      if (bookingsConfirmed.length) {
        const ws = await tx.workspace.findUniqueOrThrow({ where: { id: order.workspaceId }, select: { name: true, timezone: true } });
        const title = items.find((i) => i.bookingId)?.title ?? "";
        for (const b of bookingsConfirmed) {
          const when = { startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), title, expert: ws.name };
          await tx.emailOutbox.createMany({
            skipDuplicates: true,
            data: [
              { dedupeKey: `booking:customer:${b.id}`, to: customer.email, template: "booking_confirmed", locale: customer.locale, data: { ...when, timezone: b.customerTz } },
              ...(owner ? [{ dedupeKey: `booking:expert:${b.id}`, to: owner.user.email, template: "new_booking", locale: owner.user.locale, data: { ...when, timezone: ws.timezone, client: customer.name ?? customer.email } }] : []),
            ],
          });
        }
      }
      await tx.emailOutbox.createMany({
        skipDuplicates: true,
        data: [
          { dedupeKey: `order-paid:customer:${order.id}`, to: customer.email, template: "order_receipt", locale: customer.locale, data: emailData },
          ...(owner ? [{ dedupeKey: `order-paid:expert:${order.id}`, to: owner.user.email, template: "new_sale", locale: owner.user.locale, data: emailData }] : []),
        ],
      });
      return "settled";
    });
  }

  /** Checkout abandoned/expired or async payment failed: release anything held for it. */
  async markUnpaid(orderId: string, to: "EXPIRED" | "FAILED"): Promise<void> {
    await this.prisma.db.$transaction(async (tx) => {
      const order = await this.lock(tx, orderId);
      if (!orderMachine.can(order.status, to) || order.status === to) return;
      await tx.order.update({ where: { id: order.id }, data: { status: to } });
      await tx.booking.updateMany({
        where: { orderItem: { orderId: order.id }, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED", holdExpiresAt: null },
      });
    });
  }

  /**
   * Applies the processor's cumulative refunded amount. Only the delta since the last
   * applied refund is posted, keyed by the cumulative total, so replays are no-ops.
   */
  async applyRefundTotal(orderId: string, refundedTotalMinor: bigint): Promise<void> {
    await this.unwind(orderId, refundedTotalMinor, "REFUND", `refund:${refundedTotalMinor}`);
  }

  async applyLostDispute(orderId: string, disputeId: string, amountMinor: bigint): Promise<void> {
    await this.prisma.db.$transaction(async (tx) => {
      const order = await this.lock(tx, orderId);
      await this.unwindIn(tx, order, order.refundedMinor + amountMinor, "DISPUTE_LOST", `dispute:${disputeId}`);
    });
  }

  private async unwind(orderId: string, newTotal: bigint, kind: "REFUND" | "DISPUTE_LOST", suffix: string) {
    await this.prisma.db.$transaction(async (tx) => {
      const order = await this.lock(tx, orderId);
      await this.unwindIn(tx, order, newTotal, kind, suffix);
    });
  }

  private async unwindIn(tx: Tx, order: LockedOrder, newTotal: bigint, kind: "REFUND" | "DISPUTE_LOST", suffix: string) {
    if (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED") return;
    const capped = newTotal > order.subtotalMinor ? order.subtotalMinor : newTotal;
    const delta = capped - order.refundedMinor;
    if (delta <= 0n) return;

    const stillInHold = !(await this.ledger.hasPosted(tx, "FUNDS_RELEASED", order.id));
    await this.ledger.post(
      tx,
      ledger.refund({ refundId: `${order.id}:${suffix}`, order: { grossMinor: order.subtotalMinor, platformFeeMinor: order.platformFeeMinor }, refundMinor: delta, stillInHold, kind }),
      { workspaceId: order.workspaceId, currency: order.currency },
    );

    const full = capped === order.subtotalMinor;
    const to = full ? "REFUNDED" : "PARTIALLY_REFUNDED";
    orderMachine.assert(order.status, to);
    await tx.order.update({ where: { id: order.id }, data: { status: to, refundedMinor: capped } });

    if (full) {
      await tx.entitlement.updateMany({ where: { orderItem: { orderId: order.id }, status: "ACTIVE" }, data: { status: "REFUNDED" } });
    }
    const customer = await tx.user.findUniqueOrThrow({ where: { id: order.customerId }, select: { email: true } });
    const contact = await tx.contact.findUnique({ where: { workspaceId_email: { workspaceId: order.workspaceId, email: customer.email } } });
    if (contact) await tx.contact.update({ where: { id: contact.id }, data: { lifetimeValueMinor: { decrement: delta } } });
    await this.activity(tx, order.workspaceId, contact?.id ?? null, kind === "REFUND" ? "REFUNDED" : "DISPUTE_LOST", `${order.id}:${suffix}`, { amountMinor: delta.toString(), currency: order.currency });
  }

  /**
   * Moves earnings whose hold has ended from PENDING to AVAILABLE, one release per order.
   * The release amount is whatever is still pending for that order (refunds during the hold
   * already reduced it), so balances stay exact.
   */
  async releaseDueFunds(now = new Date(), limit = 500): Promise<number> {
    const due = await this.prisma.db.$queryRaw<Array<{ refId: string; workspaceId: string; currency: string }>>`
      SELECT t."refId", a."workspaceId", a.currency
      FROM "LedgerTransaction" t
      JOIN "LedgerEntry" e ON e."transactionId" = t.id
      JOIN "LedgerAccount" a ON a.id = e."accountId" AND a.type = 'EXPERT_PENDING'
      WHERE t.kind = 'ORDER_PAID' AND e."availableAt" <= ${now}
        AND NOT EXISTS (SELECT 1 FROM "LedgerTransaction" r WHERE r.kind = 'FUNDS_RELEASED' AND r."refId" = t."refId")
      ORDER BY e."availableAt"
      LIMIT ${limit}`;

    let released = 0;
    for (const row of due) {
      await this.prisma.db.$transaction(async (tx) => {
        await this.lock(tx, row.refId);
        const [pending] = await tx.$queryRaw<Array<{ total: bigint | null }>>`
          SELECT SUM(e."amountMinor")::bigint AS total
          FROM "LedgerEntry" e
          JOIN "LedgerTransaction" t ON t.id = e."transactionId"
          JOIN "LedgerAccount" a ON a.id = e."accountId" AND a.type = 'EXPERT_PENDING'
          WHERE t."refId" = ${row.refId} OR t."refId" LIKE ${`${row.refId}:%`}`;
        const amount = -(pending?.total ?? 0n); // credit-normal account
        const posted = await this.ledger.post(tx, ledger.fundsReleased({ releaseId: row.refId, amountMinor: amount }), { workspaceId: row.workspaceId, currency: row.currency });
        if (posted) released++;
      });
    }
    return released;
  }

  private async lock(tx: Tx, orderId: string): Promise<LockedOrder> {
    const rows = await tx.$queryRaw<LockedOrder[]>`
      SELECT id, "workspaceId", "customerId", status, currency, "subtotalMinor", "platformFeeMinor", "refundedMinor", "feeBpsSnapshot", "feeFixedSnapshot"
      FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    if (!rows[0]) throw new Error(`order ${orderId} not found`);
    return rows[0];
  }

  private async activity(tx: Tx, workspaceId: string, contactId: string | null, type: string, refId: string, data: Prisma.InputJsonValue) {
    await tx.activityEvent.createMany({ skipDuplicates: true, data: [{ id: randomUUID(), workspaceId, contactId, type, refId, data }] });
  }
}

type LockedOrder = {
  id: string;
  workspaceId: string;
  customerId: string;
  status: "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  currency: string;
  subtotalMinor: bigint;
  platformFeeMinor: bigint;
  refundedMinor: bigint;
  feeBpsSnapshot: number;
  feeFixedSnapshot: bigint;
};
