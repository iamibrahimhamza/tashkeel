import { Injectable } from "@nestjs/common";
import Stripe from "stripe";
import { env } from "../../config/env";
import { DomainError } from "../../common/errors";
import type { PaymentGatewayAdapter, ProviderSubscription } from "./gateway";

const notConfigured = () =>
  new DomainError("INTERNAL", 503, "Stripe is not configured on this server", "لم يتم ربط Stripe على هذا الخادم");

/** Production adapter: Stripe Checkout, Billing and signed webhooks. */
@Injectable()
export class StripeGatewayAdapter implements PaymentGatewayAdapter {
  private client?: Stripe;
  private verifier?: Stripe;

  private stripe(): Stripe {
    const key = env().STRIPE_SECRET_KEY;
    if (!key || key === "mock") throw notConfigured();
    this.client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "Tashkeel Pay" } });
    return this.client;
  }

  async createCheckoutSession(a: Parameters<PaymentGatewayAdapter["createCheckoutSession"]>[0]) {
    const session = await this.stripe().checkout.sessions.create(
      {
        mode: "payment",
        customer_email: a.customerEmail,
        client_reference_id: a.orderId,
        metadata: { orderId: a.orderId },
        payment_intent_data: { metadata: { orderId: a.orderId } },
        line_items: a.lineItems.map((li) => ({
          quantity: li.quantity,
          price_data: { currency: a.currency.toLowerCase(), unit_amount: Number(li.unitAmountMinor), product_data: { name: li.title } },
        })),
        locale: a.locale === "ar" ? "auto" : "en",
        success_url: a.successUrl,
        cancel_url: a.cancelUrl,
        expires_at: Math.floor(a.expiresAt.getTime() / 1000),
      },
      { idempotencyKey: a.idempotencyKey },
    );
    if (!session.url) throw new Error("Stripe returned a session without a URL");
    return { id: session.id, url: session.url };
  }

  async createSubscriptionCheckout(a: Parameters<PaymentGatewayAdapter["createSubscriptionCheckout"]>[0]) {
    const session = await this.stripe().checkout.sessions.create(
      {
        mode: "subscription",
        ...(a.customerId ? { customer: a.customerId } : { customer_email: a.customerEmail }),
        client_reference_id: a.workspaceId,
        metadata: { workspaceId: a.workspaceId },
        subscription_data: { metadata: { workspaceId: a.workspaceId } },
        line_items: [{ price: a.priceId, quantity: 1 }],
        success_url: a.successUrl,
        cancel_url: a.cancelUrl,
      },
      { idempotencyKey: a.idempotencyKey },
    );
    if (!session.url) throw new Error("Stripe returned a session without a URL");
    return { id: session.id, url: session.url };
  }

  async expireCheckoutSession(sessionId: string): Promise<void> {
    try {
      await this.stripe().checkout.sessions.expire(sessionId);
    } catch (e) {
      // Already completed or expired: nothing left to close.
      if (e instanceof Stripe.errors.StripeInvalidRequestError) return;
      throw e;
    }
  }

  async retrieveSubscription(id: string): Promise<ProviderSubscription> {
    const sub = await this.stripe().subscriptions.retrieve(id);
    const item = sub.items.data[0];
    return {
      id: sub.id,
      status: sub.status,
      customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      priceId: item?.price.id ?? null,
      workspaceId: sub.metadata.workspaceId ?? null,
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    };
  }

  async processorFee(paymentIntentId: string): Promise<bigint> {
    const pi = await this.stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
    const charge = pi.latest_charge;
    const bt = charge && typeof charge === "object" ? charge.balance_transaction : null;
    if (!bt || typeof bt !== "object") return 0n;
    // Stripe reports the fee in the settlement currency; for same-currency settlement this is exact.
    return BigInt(bt.fee);
  }

  verifyWebhook(rawBody: Buffer, signature: string) {
    const secret = env().STRIPE_WEBHOOK_SECRET;
    if (!secret) throw notConfigured();
    try {
      // constructEvent is a pure HMAC check; the client's API key is never used for it.
      this.verifier ??= new Stripe("sk_signature_verification_only");
      return this.verifier.webhooks.constructEvent(rawBody, signature, secret) as unknown as ReturnType<PaymentGatewayAdapter["verifyWebhook"]>;
    } catch {
      throw new DomainError("BAD_REQUEST", 400, "Invalid webhook signature");
    }
  }
}
