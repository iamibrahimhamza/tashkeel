import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeFees, DEFAULT_PLANS, refundFeeShare } from "./fees";
import { divRound, formatMoney, parseMajor } from "./money";

describe("computeFees", () => {
  it.each([
    // gross, plan, processor, platformFee, net
    [10000n, "FREE", 320n, 400n, 9280n],
    [10000n, "PRO", 320n, 200n, 9480n],
    [10000n, "BUSINESS", 320n, 0n, 9680n],
    [999n, "FREE", 0n, 40n, 959n], // 39.96 → 40 (half-up)
    [0n, "FREE", 0n, 0n, 0n],
  ] as const)("gross %s on %s", (gross, plan, proc, fee, net) => {
    const r = computeFees(gross, DEFAULT_PLANS[plan], proc);
    expect(r.platformFeeMinor).toBe(fee);
    expect(r.netMinor).toBe(net);
  });

  it("never charges more than the gross", () => {
    const r = computeFees(50n, { feeBps: 800, feeFixedMinor: 100n }, 30n);
    expect(r.platformFeeMinor).toBe(50n);
    expect(r.processorFeeMinor).toBe(0n);
    expect(r.netMinor).toBe(0n);
  });

  it("splits gross exactly into fee + processor + net (property)", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.bigInt({ min: 0n, max: 10_000n }),
        fc.bigInt({ min: 0n, max: 10n ** 6n }),
        (gross, bps, fixed, proc) => {
          const r = computeFees(gross, { feeBps: bps, feeFixedMinor: fixed }, proc);
          expect(r.platformFeeMinor + r.processorFeeMinor + r.netMinor).toBe(gross);
          expect(r.netMinor >= 0n).toBe(true);
        },
      ),
    );
  });
});

describe("refundFeeShare", () => {
  it("is pro rata and capped at the full fee", () => {
    expect(refundFeeShare({ grossMinor: 10000n, platformFeeMinor: 800n }, 5000n)).toBe(400n);
    expect(refundFeeShare({ grossMinor: 10000n, platformFeeMinor: 800n }, 10000n)).toBe(800n);
    expect(refundFeeShare({ grossMinor: 10000n, platformFeeMinor: 800n }, 0n)).toBe(0n);
  });
});

describe("money helpers", () => {
  it("rounds half away from zero", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
  });

  it("parses major units per currency exponent", () => {
    expect(parseMajor("49.99", "USD")).toBe(4999n);
    expect(parseMajor("100", "JPY")).toBe(100n);
    expect(parseMajor("1.5", "KWD")).toBe(1500n);
    expect(() => parseMajor("1.999", "USD")).toThrow();
  });

  it("always formats with Western digits, in Arabic too", () => {
    expect(formatMoney(15000n, "USD", { locale: "ar" })).toMatch(/150\s\$/);
    expect(formatMoney(15000n, "USD", { locale: "ar" })).not.toContain("US$");
    expect(formatMoney(123456n, "USD", { locale: "ar" })).not.toMatch(/[\u0660-\u0669]/);
    expect(formatMoney(15050n, "USD", { locale: "en" })).toBe("$150.50");
  });
});
