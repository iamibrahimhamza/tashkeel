import { divRound, minBig } from "./money";

export interface FeeSchedule {
  /** Platform transaction fee in basis points (800 = 8%). */
  feeBps: number;
  /** Flat platform fee per order, in minor units. */
  feeFixedMinor: bigint;
}

export interface FeeBreakdown {
  grossMinor: bigint;
  platformFeeMinor: bigint;
  processorFeeMinor: bigint;
  /** What the expert earns: gross − platform fee − processor fee (never negative). */
  netMinor: bigint;
}

/**
 * Hybrid model: subscription tier sets the per-transaction fee.
 * The platform fee never exceeds the gross amount; processor fees are borne by the expert.
 */
export function computeFees(grossMinor: bigint, schedule: FeeSchedule, processorFeeMinor = 0n): FeeBreakdown {
  if (grossMinor < 0n) throw new RangeError("gross must be non-negative");
  if (schedule.feeBps < 0 || schedule.feeBps > 10_000) throw new RangeError("feeBps out of range");
  if (grossMinor === 0n) return { grossMinor, platformFeeMinor: 0n, processorFeeMinor: 0n, netMinor: 0n };

  const pct = divRound(grossMinor * BigInt(schedule.feeBps), 10_000n);
  const platformFeeMinor = minBig(grossMinor, pct + schedule.feeFixedMinor);
  const proc = minBig(processorFeeMinor, grossMinor - platformFeeMinor);
  return {
    grossMinor,
    platformFeeMinor,
    processorFeeMinor: proc,
    netMinor: grossMinor - platformFeeMinor - proc,
  };
}

/** Share of the original platform fee returned on a (partial) refund, pro rata. */
export function refundFeeShare(order: { grossMinor: bigint; platformFeeMinor: bigint }, refundMinor: bigint): bigint {
  if (refundMinor <= 0n || order.grossMinor === 0n) return 0n;
  if (refundMinor >= order.grossMinor) return order.platformFeeMinor;
  return divRound(order.platformFeeMinor * refundMinor, order.grossMinor);
}

/** Default plan table; the DB `Plan` rows are the runtime source of truth. */
export const DEFAULT_PLANS = {
  FREE: { monthlyMinor: 0n, feeBps: 800, feeFixedMinor: 0n },
  PRO: { monthlyMinor: 2900n, feeBps: 400, feeFixedMinor: 0n },
  BUSINESS: { monthlyMinor: 7900n, feeBps: 150, feeFixedMinor: 0n },
} as const;
