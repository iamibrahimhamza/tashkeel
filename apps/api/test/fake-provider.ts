import Stripe from "stripe";
import { StripeGatewayAdapter, type PaymentGatewayAdapter, type ProviderSubscription } from "../src/modules/pay/gateway";
import { TEST_SECRETS } from "./harness";

/**
 * Records outbound calls instead of hitting Stripe. Webhook signature verification is the
 * real Stripe implementation, fed with payloads signed by `signStripe`.
 */
export class FakeGatewayAdapter implements PaymentGatewayAdapter {
  sessions: Array<Parameters<PaymentGatewayAdapter["createCheckoutSession"]>[0] & { id: string }> = [];
  subscriptionCheckouts: Array<Parameters<PaymentGatewayAdapter["createSubscriptionCheckout"]>[0]> = [];
  subscriptions = new Map<string, ProviderSubscription>();
  fee = 320n;
  private readonly real = new StripeGatewayAdapter();

  async createCheckoutSession(args: Parameters<PaymentGatewayAdapter["createCheckoutSession"]>[0]) {
    // Like Stripe, the same idempotency key returns the same session.
    const existing = this.sessions.find((s) => s.idempotencyKey === args.idempotencyKey);
    if (existing) return { id: existing.id, url: `https://checkout.stripe.test/${existing.id}` };
    const id = `cs_test_${this.sessions.length + 1}`;
    this.sessions.push({ ...args, id });
    return { id, url: `https://checkout.stripe.test/${id}` };
  }

  async createSubscriptionCheckout(args: Parameters<PaymentGatewayAdapter["createSubscriptionCheckout"]>[0]) {
    this.subscriptionCheckouts.push(args);
    return { id: `cs_sub_${this.subscriptionCheckouts.length}`, url: "https://checkout.stripe.test/sub" };
  }

  expired: string[] = [];
  async expireCheckoutSession(id: string) {
    this.expired.push(id);
  }

  async retrieveSubscription(id: string) {
    const s = this.subscriptions.get(id);
    if (!s) throw new Error(`no such subscription ${id}`);
    return s;
  }

  async processorFee() {
    return this.fee;
  }

  verifyWebhook(rawBody: Buffer, signature: string) {
    return this.real.verifyWebhook(rawBody, signature);
  }
}

const signer = new Stripe("sk_test_signing_only");
let seq = 0;

/** A Stripe-shaped event, JSON-encoded and signed with the test webhook secret. */
export function signStripe(type: string, object: Record<string, unknown>, id = `evt_test_${++seq}`) {
  const payload = JSON.stringify({ id, object: "event", type, data: { object } });
  const signature = signer.webhooks.generateTestHeaderString({ payload, secret: TEST_SECRETS.stripeWebhook });
  return { id, payload, signature };
}
