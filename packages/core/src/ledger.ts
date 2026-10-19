import { refundFeeShare } from "./fees";

/**
 * Double-entry postings for Tashkeel Pay.
 * Sign convention: positive = debit, negative = credit. Every transaction sums to zero.
 * Asset/expense accounts (CUSTOMER_FUNDS, PROCESSOR_FEES) are debit-normal;
 * liability/revenue accounts (EXPERT_*, PAYOUTS_IN_TRANSIT, PLATFORM_REVENUE) are credit-normal,
 * so their displayed balance is the negated sum of entries.
 */
export type LedgerAccountType =
  | "CUSTOMER_FUNDS"
  | "PROCESSOR_FEES"
  | "PLATFORM_REVENUE"
  | "EXPERT_PENDING"
  | "EXPERT_AVAILABLE"
  | "PAYOUTS_IN_TRANSIT";

export type LedgerTxKind =
  | "ORDER_PAID"
  | "FUNDS_RELEASED"
  | "REFUND"
  | "PAYOUT_REQUESTED"
  | "PAYOUT_PAID"
  | "PAYOUT_FAILED"
  | "DISPUTE_LOST";

export interface AccountRef {
  owner: "PLATFORM" | "WORKSPACE";
  type: LedgerAccountType;
}

export interface Posting {
  account: AccountRef;
  amountMinor: bigint;
  /** Only for EXPERT_PENDING credits: when the hold ends. */
  availableAt?: Date;
}

export interface JournalEntry {
  kind: LedgerTxKind;
  refType: "order" | "payout" | "release" | "dispute";
  refId: string;
  memo?: string;
  postings: Posting[];
}

export const CREDIT_NORMAL: ReadonlySet<LedgerAccountType> = new Set([
  "PLATFORM_REVENUE",
  "EXPERT_PENDING",
  "EXPERT_AVAILABLE",
  "PAYOUTS_IN_TRANSIT",
]);

const platform = (type: LedgerAccountType): AccountRef => ({ owner: "PLATFORM", type });
const expert = (type: LedgerAccountType): AccountRef => ({ owner: "WORKSPACE", type });

export class UnbalancedJournalError extends Error {}

export function assertBalanced(entry: JournalEntry): JournalEntry {
  const sum = entry.postings.reduce((acc, p) => acc + p.amountMinor, 0n);
  if (sum !== 0n) throw new UnbalancedJournalError(`${entry.kind}:${entry.refId} sums to ${sum}`);
  return { ...entry, postings: entry.postings.filter((p) => p.amountMinor !== 0n) };
}

/** Normal-side balance for display (credit-normal accounts are negated). */
export function displayBalance(type: LedgerAccountType, rawSum: bigint): bigint {
  return CREDIT_NORMAL.has(type) ? -rawSum : rawSum;
}

export const DEFAULT_HOLD_DAYS = 7;

export function orderPaid(args: {
  orderId: string;
  grossMinor: bigint;
  platformFeeMinor: bigint;
  processorFeeMinor: bigint;
  paidAt: Date;
  holdDays?: number;
}): JournalEntry {
  const { grossMinor: g, platformFeeMinor: f, processorFeeMinor: p } = args;
  const availableAt = new Date(args.paidAt.getTime() + (args.holdDays ?? DEFAULT_HOLD_DAYS) * 86_400_000);
  return assertBalanced({
    kind: "ORDER_PAID",
    refType: "order",
    refId: args.orderId,
    postings: [
      { account: platform("CUSTOMER_FUNDS"), amountMinor: g - p },
      { account: platform("PLATFORM_REVENUE"), amountMinor: -f },
      { account: expert("EXPERT_PENDING"), amountMinor: -(g - f - p), availableAt },
    ],
  });
}

export function fundsReleased(args: { releaseId: string; amountMinor: bigint }): JournalEntry {
  return assertBalanced({
    kind: "FUNDS_RELEASED",
    refType: "release",
    refId: args.releaseId,
    postings: [
      { account: expert("EXPERT_PENDING"), amountMinor: args.amountMinor },
      { account: expert("EXPERT_AVAILABLE"), amountMinor: -args.amountMinor },
    ],
  });
}

/**
 * Refund `refundMinor` of an order. The platform returns its fee pro rata; the processor fee
 * is not recovered (Stripe keeps it) and stays with the expert. The expert side is debited from
 * PENDING while the order is still in its hold window, otherwise from AVAILABLE (may go negative
 * and is netted against future earnings).
 */
export function refund(args: {
  refundId: string;
  order: { grossMinor: bigint; platformFeeMinor: bigint };
  refundMinor: bigint;
  stillInHold: boolean;
  /** A lost chargeback unwinds money exactly like a refund but is booked separately. */
  kind?: "REFUND" | "DISPUTE_LOST";
}): JournalEntry {
  const feeBack = refundFeeShare(args.order, args.refundMinor);
  return assertBalanced({
    kind: args.kind ?? "REFUND",
    refType: args.kind === "DISPUTE_LOST" ? "dispute" : "order",
    refId: args.refundId,
    postings: [
      { account: platform("CUSTOMER_FUNDS"), amountMinor: -args.refundMinor },
      { account: platform("PLATFORM_REVENUE"), amountMinor: feeBack },
      { account: expert(args.stillInHold ? "EXPERT_PENDING" : "EXPERT_AVAILABLE"), amountMinor: args.refundMinor - feeBack },
    ],
  });
}

export function payoutRequested(args: { payoutId: string; amountMinor: bigint }): JournalEntry {
  return assertBalanced({
    kind: "PAYOUT_REQUESTED",
    refType: "payout",
    refId: args.payoutId,
    postings: [
      { account: expert("EXPERT_AVAILABLE"), amountMinor: args.amountMinor },
      { account: expert("PAYOUTS_IN_TRANSIT"), amountMinor: -args.amountMinor },
    ],
  });
}

export function payoutPaid(args: { payoutId: string; amountMinor: bigint }): JournalEntry {
  return assertBalanced({
    kind: "PAYOUT_PAID",
    refType: "payout",
    refId: args.payoutId,
    postings: [
      { account: expert("PAYOUTS_IN_TRANSIT"), amountMinor: args.amountMinor },
      { account: platform("CUSTOMER_FUNDS"), amountMinor: -args.amountMinor },
    ],
  });
}

export function payoutFailed(args: { payoutId: string; amountMinor: bigint }): JournalEntry {
  return assertBalanced({
    kind: "PAYOUT_FAILED",
    refType: "payout",
    refId: args.payoutId,
    postings: [
      { account: expert("PAYOUTS_IN_TRANSIT"), amountMinor: args.amountMinor },
      { account: expert("EXPERT_AVAILABLE"), amountMinor: -args.amountMinor },
    ],
  });
}
