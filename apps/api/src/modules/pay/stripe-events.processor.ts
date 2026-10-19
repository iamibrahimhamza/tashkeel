import { Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../../common/prisma.service";
import { BillingService } from "./billing.service";
import { FulfillmentService } from "./fulfillment.service";
import { PAYMENT_GATEWAY, type PaymentGatewayAdapter } from "./gateway";

// Webhook payloads are signed but still third-party data: only the fields we use are
// parsed, and each is validated before it influences money.
const CheckoutSessionObj = z.object({
  id: z.string(),
  mode: z.enum(["payment", "subscription", "setup"]),
  payment_status: z.enum(["paid", "unpaid", "no_payment_required"]),
  payment_intent: z.string().nullable().optional(),
  metadata: z.record(z.string()).nullable().optional(),
});
const ChargeObj = z.object({ payment_intent: z.string().nullable(), amount_refunded: z.number().int().nonnegative() });
const DisputeObj = z.object({ id: z.string(), payment_intent: z.string().nullable(), amount: z.number().int().positive(), status: z.string() });
const SubscriptionObj = z.object({ id: z.string() });

/** The Stripe events this processor handles — subscribe the webhook endpoint to exactly these. */
export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.closed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

@Injectable()
export class StripeEventsProcessor {
  private readonly log = new Logger("StripeEvents");

  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfillment: FulfillmentService,
    private readonly billing: BillingService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayAdapter,
  ) {}

  /** Job handler. Throws on failure so the queue retries; the row records every attempt. */
  async handle(webhookEventId: string): Promise<void> {
    const db = this.prisma.db;
    const row = await db.webhookEvent.update({ where: { id: webhookEventId }, data: { attempts: { increment: 1 } } });
    if (row.status === "PROCESSED") return;
    try {
      await this.dispatch(row.type, (row.payload as { data?: { object?: unknown } }).data?.object);
      await db.webhookEvent.update({ where: { id: row.id }, data: { status: "PROCESSED", processedAt: new Date(), lastError: null } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.webhookEvent.update({ where: { id: row.id }, data: { status: "FAILED", lastError: msg.slice(0, 2000) } });
      throw e;
    }
  }

  private async dispatch(type: string, obj: unknown) {
    switch (type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = CheckoutSessionObj.parse(obj);
        if (s.mode !== "payment") return; // subscription state arrives via customer.subscription.*
        if (s.payment_status !== "paid") return; // async methods settle later
        const orderId = await this.orderForSession(s);
        const fee = s.payment_intent ? await this.gateway.processorFee(s.payment_intent) : 0n;
        await this.fulfillment.settlePaid(orderId, { paymentIntentId: s.payment_intent ?? null, processorFeeMinor: fee });
        return;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const s = CheckoutSessionObj.parse(obj);
        if (s.mode !== "payment") return;
        await this.fulfillment.markUnpaid(await this.orderForSession(s), type.endsWith("expired") ? "EXPIRED" : "FAILED");
        return;
      }
      case "charge.refunded": {
        const c = ChargeObj.parse(obj);
        const order = c.payment_intent && (await this.prisma.db.order.findUnique({ where: { stripePaymentIntentId: c.payment_intent }, select: { id: true } }));
        if (!order) return this.log.warn(`refund for unknown payment ${c.payment_intent}`);
        await this.fulfillment.applyRefundTotal(order.id, BigInt(c.amount_refunded));
        return;
      }
      case "charge.dispute.closed": {
        const d = DisputeObj.parse(obj);
        if (d.status !== "lost") return;
        const order = d.payment_intent && (await this.prisma.db.order.findUnique({ where: { stripePaymentIntentId: d.payment_intent }, select: { id: true } }));
        if (!order) return this.log.warn(`dispute for unknown payment ${d.payment_intent}`);
        await this.fulfillment.applyLostDispute(order.id, d.id, BigInt(d.amount));
        return;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await this.billing.syncSubscription(SubscriptionObj.parse(obj).id);
        return;
      }
      default:
        return; // not subscribed to / not relevant
    }
  }

  /** The session must be the one we created for this order, never just any id in metadata. */
  private async orderForSession(s: z.infer<typeof CheckoutSessionObj>): Promise<string> {
    const orderId = s.metadata?.orderId;
    const order = orderId ? await this.prisma.db.order.findUnique({ where: { id: orderId }, select: { id: true, stripeCheckoutSessionId: true } }) : null;
    if (!order || order.stripeCheckoutSessionId !== s.id) throw new Error(`checkout session ${s.id} does not match a known order`);
    return order.id;
  }
}
