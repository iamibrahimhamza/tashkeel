import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeFees } from "./fees";
import * as ledger from "./ledger";

type Balances = Record<string, bigint>;

function apply(b: Balances, entry: ledger.JournalEntry): Balances {
  const next = { ...b };
  for (const p of entry.postings) {
    const k = p.account.type;
    next[k] = (next[k] ?? 0n) + p.amountMinor;
  }
  return next;
}

const display = (b: Balances, t: ledger.LedgerAccountType) => ledger.displayBalance(t, b[t] ?? 0n);

describe("ledger postings", () => {
  const paidAt = new Date("2026-10-01T10:00:00Z");

  it("order → release → payout lifecycle", () => {
    const fees = computeFees(10000n, { feeBps: 800, feeFixedMinor: 0n }, 320n);
    let b: Balances = {};
    b = apply(b, ledger.orderPaid({ orderId: "o1", grossMinor: 10000n, platformFeeMinor: fees.platformFeeMinor, processorFeeMinor: 320n, paidAt }));
    expect(display(b, "EXPERT_PENDING")).toBe(8880n);
    expect(display(b, "PLATFORM_REVENUE")).toBe(800n);
    expect(display(b, "CUSTOMER_FUNDS")).toBe(9680n);

    b = apply(b, ledger.fundsReleased({ releaseId: "r1", amountMinor: 8880n }));
    expect(display(b, "EXPERT_PENDING")).toBe(0n);
    expect(display(b, "EXPERT_AVAILABLE")).toBe(8880n);

    b = apply(b, ledger.payoutRequested({ payoutId: "p1", amountMinor: 5000n }));
    expect(display(b, "EXPERT_AVAILABLE")).toBe(3880n);
    expect(display(b, "PAYOUTS_IN_TRANSIT")).toBe(5000n);

    b = apply(b, ledger.payoutPaid({ payoutId: "p1", amountMinor: 5000n }));
    expect(display(b, "PAYOUTS_IN_TRANSIT")).toBe(0n);
    expect(display(b, "CUSTOMER_FUNDS")).toBe(4680n);
  });

  it("failed payout returns funds to available", () => {
    let b: Balances = { EXPERT_AVAILABLE: -5000n };
    b = apply(b, ledger.payoutRequested({ payoutId: "p2", amountMinor: 5000n }));
    b = apply(b, ledger.payoutFailed({ payoutId: "p2", amountMinor: 5000n }));
    expect(display(b, "EXPERT_AVAILABLE")).toBe(5000n);
    expect(display(b, "PAYOUTS_IN_TRANSIT")).toBe(0n);
  });

  it("full refund in hold window unwinds expert + platform shares", () => {
    let b: Balances = {};
    b = apply(b, ledger.orderPaid({ orderId: "o2", grossMinor: 10000n, platformFeeMinor: 800n, processorFeeMinor: 320n, paidAt }));
    b = apply(b, ledger.refund({ refundId: "o2:re_1", order: { grossMinor: 10000n, platformFeeMinor: 800n }, refundMinor: 10000n, stillInHold: true }));
    expect(display(b, "PLATFORM_REVENUE")).toBe(0n);
    // Expert absorbs the unrecoverable processor fee.
    expect(display(b, "EXPERT_PENDING")).toBe(-320n);
  });

  it("rejects unbalanced journals", () => {
    expect(() =>
      ledger.assertBalanced({ kind: "ORDER_PAID", refType: "order", refId: "x", postings: [{ account: { owner: "PLATFORM", type: "CUSTOMER_FUNDS" }, amountMinor: 1n }] }),
    ).toThrow(ledger.UnbalancedJournalError);
  });

  it("every generated journal balances (property)", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 10n }),
        fc.integer({ min: 0, max: 3000 }),
        fc.bigInt({ min: 0n, max: 1000n }),
        fc.boolean(),
        (gross, bps, proc, inHold) => {
          const f = computeFees(gross, { feeBps: bps, feeFixedMinor: 0n }, proc);
          const entries = [
            ledger.orderPaid({ orderId: "o", grossMinor: gross, platformFeeMinor: f.platformFeeMinor, processorFeeMinor: f.processorFeeMinor, paidAt }),
            ledger.refund({ refundId: "r", order: { grossMinor: gross, platformFeeMinor: f.platformFeeMinor }, refundMinor: gross / 2n, stillInHold: inHold }),
          ];
          for (const e of entries) expect(e.postings.reduce((s, p) => s + p.amountMinor, 0n)).toBe(0n);
        },
      ),
    );
  });
});
