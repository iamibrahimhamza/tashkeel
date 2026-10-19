import { Injectable } from "@nestjs/common";
import { divRound } from "@tashkeel/core";
import type { Prisma } from "@tashkeel/db";
import { randomUUID } from "node:crypto";
import { DomainError } from "../../common/errors";
import { PrismaService } from "../../common/prisma.service";
import { QUEUES } from "../../common/queue";
import { env } from "../../config/env";
import type { PaymentGatewayAdapter, ProviderSubscription } from "./gateway";
import { WebhookIntakeService } from "./webhook-intake.service";

/** Simulated card-processing fee, modelled on Stripe's standard card pricing (2.9% + 30¢). */
const SANDBOX_FEE = { bps: 290n, fixedMinor: 30n };

const SUB_PREFIX = "sbx_sub_";

/**
 * Local stand-in for Stripe, active when STRIPE_SECRET_KEY is empty or "mock".
 *
 * Checkout sends the buyer to a Tashkeel-hosted approval screen (/pay/sandbox/:id). Approving
 * or declining there emits Stripe-shaped events (checkout.session.completed / .expired,
 * charge.refunded, customer.subscription.updated) into the SAME intake → queue → processor
 * pipeline real webhooks use. Everything downstream — ledger, entitlements, bookings, CRM,
 * emails, payouts — therefore runs for real; only the card network is simulated.
 */
@Injectable()
export class SandboxGatewayAdapter implements PaymentGatewayAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intake: WebhookIntakeService,
  ) {}

  async createCheckoutSession(_args: Parameters<PaymentGatewayAdapter["createCheckoutSession"]>[0]) {
    const id = `sbx_cs_${randomUUID().replace(/-/g, "")}`;
    return { id, url: `${env().WEB_URL}/pay/sandbox/${id}` };
  }

  /** The id encodes what is being subscribed to, so the sandbox needs no extra storage. */
  async createSubscriptionCheckout(args: Parameters<PaymentGatewayAdapter["createSubscriptionCheckout"]>[0]) {
    const id = `${SUB_PREFIX}${Buffer.from(JSON.stringify({ w: args.workspaceId, p: args.priceId })).toString("base64url")}`;
    return { id, url: `${env().WEB_URL}/pay/sandbox/${id}` };
  }

  async retrieveSubscription(id: string): Promise<ProviderSubscription> {
    const decoded = SandboxGatewayAdapter.decodeSubscription(id);
    if (!decoded) throw new Error(`unknown sandbox subscription ${id}`);
    return {
      id,
      status: "active",
      customerId: `sbx_cus_${decoded.workspaceId}`,
      priceId: decoded.priceId,
      workspaceId: decoded.workspaceId,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    };
  }

  async processorFee(paymentIntentId: string): Promise<bigint> {
    const orderId = paymentIntentId.replace(/^sbx_pi_/, "");
    const order = await this.prisma.db.order.findUnique({ where: { id: orderId }, select: { subtotalMinor: true } });
    if (!order || order.subtotalMinor === 0n) return 0n;
    return divRound(order.subtotalMinor * SANDBOX_FEE.bps, 10_000n) + SANDBOX_FEE.fixedMinor;
  }

  verifyWebhook(): never {
    throw new DomainError("NOT_FOUND", 404, "Stripe webhooks are disabled in sandbox mode", "استقبال أحداث Stripe معطّل في الوضع التجريبي");
  }

  // ── Simulated buyer / processor actions (used by SandboxController) ──

  async approveCheckout(sessionId: string, orderId: string) {
    await this.emit("checkout.session.completed", {
      id: sessionId,
      mode: "payment",
      payment_status: "paid",
      payment_intent: `sbx_pi_${orderId}`,
      metadata: { orderId },
    });
  }

  async declineCheckout(sessionId: string, orderId: string) {
    await this.emit("checkout.session.expired", { id: sessionId, mode: "payment", payment_status: "unpaid", payment_intent: null, metadata: { orderId } });
  }

  async refund(orderId: string, refundedTotalMinor: bigint) {
    await this.emit("charge.refunded", { payment_intent: `sbx_pi_${orderId}`, amount_refunded: Number(refundedTotalMinor) });
  }

  async activateSubscription(subscriptionId: string) {
    await this.emit("customer.subscription.updated", { id: subscriptionId });
  }

  static decodeSubscription(id: string): { workspaceId: string; priceId: string } | null {
    if (!id.startsWith(SUB_PREFIX)) return null;
    try {
      const v = JSON.parse(Buffer.from(id.slice(SUB_PREFIX.length), "base64url").toString("utf8")) as { w?: unknown; p?: unknown };
      return typeof v.w === "string" && typeof v.p === "string" ? { workspaceId: v.w, priceId: v.p } : null;
    } catch {
      return null;
    }
  }

  private async emit(type: string, object: Record<string, unknown>) {
    const id = `sbx_evt_${randomUUID().replace(/-/g, "")}`;
    const event = { id, object: "event", type, livemode: false, data: { object } };
    await this.intake.intake("sandbox", id, type, event as Prisma.InputJsonValue, QUEUES.stripeEvents);
  }
}
