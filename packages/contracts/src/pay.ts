import { z } from "zod";

export const OrderStatus = z.enum(["PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED", "PARTIALLY_REFUNDED"]);
export const PayoutMethod = z.enum(["STRIPE_CONNECT", "AL_BARAKA", "SHAM_CASH", "WALLET", "BANK_WIRE"]);
export type PayoutMethod = z.infer<typeof PayoutMethod>;
export const PayoutStatus = z.enum(["REQUESTED", "APPROVED", "PROCESSING", "PAID", "FAILED", "CANCELLED"]);
export type PayoutStatus = z.infer<typeof PayoutStatus>;

/** What the buyer is purchasing. Prices are always resolved server-side. */
export const CheckoutItem = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("product"), productId: z.string() }),
  z.object({ kind: z.literal("booking"), bookingId: z.string() }),
]);

export const CreateCheckoutInput = z.object({
  workspaceSlug: z.string(),
  item: CheckoutItem,
  customer: z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().max(80).optional() }),
  locale: z.enum(["ar", "en"]).default("ar"),
});
export type CreateCheckoutInput = z.infer<typeof CreateCheckoutInput>;

export const CheckoutSession = z.object({
  orderId: z.string(),
  /** Stripe-hosted page; null when nothing is owed (free item, fulfilled immediately). */
  checkoutUrl: z.string().nullable(),
  expiresAt: z.string().nullable(),
  status: OrderStatus,
});
export type CheckoutSession = z.infer<typeof CheckoutSession>;

export const Balance = z.object({
  currency: z.string(),
  pendingMinor: z.string(),
  availableMinor: z.string(),
  inTransitMinor: z.string(),
  nextReleaseAt: z.string().nullable(),
});
export type Balance = z.infer<typeof Balance>;

// Per-method payout details. Validated, then encrypted at rest; never echoed back.
export const PayoutDetails = z.discriminatedUnion("method", [
  z.object({ method: z.literal("STRIPE_CONNECT") }),
  z.object({
    method: z.literal("AL_BARAKA"),
    accountHolder: z.string().trim().min(3).max(120),
    accountNumber: z.string().trim().min(4).max(40),
    branch: z.string().trim().max(120).optional(),
    country: z.enum(["SY", "LB", "IQ", "JO", "TR", "SA", "AE", "EG", "BH"]),
  }),
  z.object({
    method: z.literal("SHAM_CASH"),
    fullName: z.string().trim().min(3).max(120),
    walletId: z.string().trim().min(4).max(40),
    phone: z.string().trim().min(6).max(20),
  }),
  z.object({
    method: z.literal("WALLET"),
    provider: z.enum(["USDT_TRC20", "WISE", "PAYONEER", "ZAIN_CASH", "WHISH"]),
    address: z.string().trim().min(4).max(200),
  }),
  z.object({
    method: z.literal("BANK_WIRE"),
    accountHolder: z.string().trim().min(3).max(120),
    iban: z.string().trim().min(10).max(40),
    swift: z.string().trim().min(8).max(11),
    bankName: z.string().trim().max(120),
  }),
]);
export type PayoutDetails = z.infer<typeof PayoutDetails>;

export const CreatePayoutProfileInput = z.object({
  label: z.string().trim().min(1).max(60),
  details: PayoutDetails,
  isDefault: z.boolean().default(false),
});

export const PayoutProfileDto = z.object({
  id: z.string(),
  method: PayoutMethod,
  label: z.string(),
  maskedHint: z.string(), // e.g. "•••• 4821"
  isDefault: z.boolean(),
  isVerified: z.boolean(),
});

export const RequestPayoutInput = z.object({
  profileId: z.string(),
  amountMinor: z.string().regex(/^\d+$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type RequestPayoutInput = z.infer<typeof RequestPayoutInput>;

export const PayoutDto = z.object({
  id: z.string(),
  amountMinor: z.string(),
  currency: z.string(),
  method: PayoutMethod,
  status: PayoutStatus,
  providerRef: z.string().nullable(),
  createdAt: z.string(),
});
export type PayoutDto = z.infer<typeof PayoutDto>;

/** Staff transition on a manual-ops payout. */
export const AdminPayoutTransitionInput = z.discriminatedUnion("to", [
  z.object({ to: z.literal("APPROVED"), note: z.string().max(500).optional(), complianceChecked: z.literal(true) }),
  z.object({ to: z.literal("PROCESSING"), note: z.string().max(500).optional() }),
  z.object({ to: z.literal("PAID"), providerRef: z.string().trim().min(3).max(120), receiptKey: z.string().max(300).optional(), note: z.string().max(500).optional() }),
  z.object({ to: z.literal("FAILED"), reason: z.string().trim().min(3).max(500) }),
  z.object({ to: z.literal("CANCELLED"), reason: z.string().trim().min(3).max(500) }),
]);
export type AdminPayoutTransitionInput = z.infer<typeof AdminPayoutTransitionInput>;

export const OrderDto = z.object({
  id: z.string(),
  status: OrderStatus,
  currency: z.string(),
  subtotalMinor: z.string(),
  platformFeeMinor: z.string(),
  processorFeeMinor: z.string(),
  netMinor: z.string(),
  refundedMinor: z.string(),
  customer: z.object({ email: z.string(), name: z.string().nullable() }),
  items: z.array(z.object({ title: z.string(), unitPriceMinor: z.string(), quantity: z.number() })),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});
export type OrderDto = z.infer<typeof OrderDto>;

export const OrdersQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: OrderStatus.optional(),
});

export const LedgerQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
});

export const LedgerLineDto = z.object({
  id: z.string(),
  at: z.string(),
  kind: z.string(),
  refType: z.string(),
  refId: z.string(),
  account: z.enum(["EXPERT_PENDING", "EXPERT_AVAILABLE", "PAYOUTS_IN_TRANSIT"]),
  /** Signed from the expert's point of view: + money owed to the expert grows. */
  amountMinor: z.string(),
  currency: z.string(),
});
export type LedgerLineDto = z.infer<typeof LedgerLineDto>;

/** Cursor-paginated feeds (ledger, orders, payouts). */
export function cursorPage<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), nextCursor: z.string().nullable() });
}

export const AdminPayoutsQuery = z.object({
  status: PayoutStatus.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Status update pushed by an alternative payout provider (HMAC-signed). Untrusted input. */
export const PayoutProviderEvent = z.object({
  eventId: z.string().min(1).max(200),
  payoutId: z.string().min(1).max(64),
  status: z.enum(["PROCESSING", "PAID", "FAILED"]),
  providerRef: z.string().max(200).optional(),
  reason: z.string().max(500).optional(),
});
export type PayoutProviderEvent = z.infer<typeof PayoutProviderEvent>;

export const BillingCheckoutInput = z.object({ planCode: z.enum(["PRO", "BUSINESS"]) });
export type BillingCheckoutInput = z.infer<typeof BillingCheckoutInput>;
