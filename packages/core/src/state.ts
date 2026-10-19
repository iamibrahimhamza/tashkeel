/** Explicit state machines. Anything not listed is an illegal transition. */

export type OrderStatus = "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "REFUNDED" | "PARTIALLY_REFUNDED";
export type PayoutStatus = "REQUESTED" | "APPROVED" | "PROCESSING" | "PAID" | "FAILED" | "CANCELLED";
export type BookingStatus = "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

const ORDER: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["PAID", "FAILED", "EXPIRED"],
  // A late async success can still settle a session we marked failed/expired.
  FAILED: ["PAID"],
  EXPIRED: ["PAID"],
  PAID: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  REFUNDED: [],
};

const PAYOUT: Record<PayoutStatus, readonly PayoutStatus[]> = {
  REQUESTED: ["APPROVED", "CANCELLED", "FAILED"],
  APPROVED: ["PROCESSING", "PAID", "FAILED", "CANCELLED"],
  PROCESSING: ["PAID", "FAILED"],
  PAID: [],
  FAILED: [],
  CANCELLED: [],
};

const BOOKING: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED", "COMPLETED", "NO_SHOW"],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
};

export class IllegalTransitionError extends Error {
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`${machine}: ${from} → ${to} is not allowed`);
  }
}

function make<S extends string>(name: string, table: Record<S, readonly S[]>) {
  return {
    can: (from: S, to: S) => table[from].includes(to),
    assert(from: S, to: S) {
      if (!table[from].includes(to)) throw new IllegalTransitionError(name, from, to);
    },
    isTerminal: (s: S) => table[s].length === 0,
  };
}

export const orderMachine = make<OrderStatus>("order", ORDER);
export const payoutMachine = make<PayoutStatus>("payout", PAYOUT);
export const bookingMachine = make<BookingStatus>("booking", BOOKING);

/** Statuses whose money is still "owed" to the expert (counted against available balance). */
export const PAYOUT_OPEN: readonly PayoutStatus[] = ["REQUESTED", "APPROVED", "PROCESSING"];
