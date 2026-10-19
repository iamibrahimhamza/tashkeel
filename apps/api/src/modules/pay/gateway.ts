import { env } from "../../config/env";

export type GatewayMode = "stripe" | "sandbox";

/**
 * Sandbox whenever no real Stripe key is configured (empty or "mock"). Production refuses to
 * boot without real keys (see config/env.ts), so the sandbox can never take real orders.
 */
export function gatewayMode(): GatewayMode {
  const key = env().STRIPE_SECRET_KEY;
  return !key || key === "mock" ? "sandbox" : "stripe";
}

/**
 * Everything Tashkeel Pay needs from a card processor. Two implementations:
 *  - StripeGatewayAdapter: real Stripe Checkout, Billing and signed webhooks
 *  - SandboxGatewayAdapter: local approval screen that feeds the same event pipeline
 * Tests use a recording fake, so no test calls Stripe over the network.
 */
export interface PaymentGatewayAdapter {
  createCheckoutSession(args: {
    orderId: string;
    currency: string;
    lineItems: Array<{ title: string; unitAmountMinor: bigint; quantity: number }>;
    customerEmail: string;
    locale: "ar" | "en";
    successUrl: string;
    cancelUrl: string;
    expiresAt: Date;
    idempotencyKey: string;
  }): Promise<{ id: string; url: string }>;

  createSubscriptionCheckout(args: {
    workspaceId: string;
    priceId: string;
    customerId?: string;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<{ id: string; url: string }>;

  /**
   * Closes an unpaid checkout so it can no longer be paid (used when a booking hold lapses).
   * Must be a no-op for sessions that are already complete or expired.
   */
  expireCheckoutSession(sessionId: string): Promise<void>;

  /** Current state of a subscription, read fresh from the processor. */
  retrieveSubscription(id: string): Promise<ProviderSubscription>;

  /** Processor fee charged on a payment, in minor units of the order currency. */
  processorFee(paymentIntentId: string): Promise<bigint>;

  /** Verifies the signature and returns the parsed (still untrusted) event. */
  verifyWebhook(rawBody: Buffer, signature: string): { id: string; type: string; data: { object: unknown } };
}

export interface ProviderSubscription {
  id: string;
  status: string;
  customerId: string | null;
  priceId: string | null;
  workspaceId: string | null;
  currentPeriodEnd: Date | null;
}

export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY");


export { StripeGatewayAdapter } from "./stripe-gateway.adapter";
