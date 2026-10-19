import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canViewLesson, checkEntitlement, progressPercent } from "./access";
import { hashRequest, stableStringify } from "./idempotency";
import { decryptJson, encryptJson, maskTail } from "./payouts";
import { can } from "./rbac";
import { IllegalTransitionError, bookingMachine, orderMachine, payoutMachine } from "./state";

describe("state machines", () => {
  it("allows the happy paths", () => {
    expect(orderMachine.can("PENDING", "PAID")).toBe(true);
    expect(payoutMachine.can("APPROVED", "PAID")).toBe(true);
    expect(bookingMachine.can("PENDING_PAYMENT", "CONFIRMED")).toBe(true);
  });

  it("rejects going backwards or leaving terminal states", () => {
    expect(() => orderMachine.assert("PAID", "PENDING")).toThrow(IllegalTransitionError);
    expect(() => payoutMachine.assert("PAID", "FAILED")).toThrow(IllegalTransitionError);
    expect(bookingMachine.isTerminal("CANCELLED")).toBe(true);
  });
});

describe("access gates", () => {
  const now = new Date("2026-10-19T00:00:00Z");
  it("requires an active, unexpired entitlement", () => {
    expect(checkEntitlement(null, now)).toEqual({ allowed: false, reason: "NO_ENTITLEMENT" });
    expect(checkEntitlement({ status: "REFUNDED", expiresAt: null }, now)).toEqual({ allowed: false, reason: "REVOKED" });
    expect(checkEntitlement({ status: "ACTIVE", expiresAt: new Date("2026-10-18T00:00:00Z") }, now)).toEqual({ allowed: false, reason: "EXPIRED" });
    expect(checkEntitlement({ status: "ACTIVE", expiresAt: null }, now)).toEqual({ allowed: true });
  });
  it("lets anyone view preview lessons", () => {
    expect(canViewLesson({ isPreview: true }, null, now).allowed).toBe(true);
    expect(canViewLesson({ isPreview: false }, null, now).allowed).toBe(false);
  });
  it("computes progress", () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(3, 1)).toBe(33);
  });
});

describe("idempotency hashing", () => {
  it("is key-order independent and payload sensitive", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1n, c: undefined }] })).toBe('{"a":[2,{"d":"1"}],"b":1}');
    expect(hashRequest("post", "/x", { a: 1, b: 2 })).toBe(hashRequest("POST", "/x", { b: 2, a: 1 }));
    expect(hashRequest("POST", "/x", { a: 1 })).not.toBe(hashRequest("POST", "/x", { a: 2 }));
  });
});

describe("rbac", () => {
  it("keeps money movement owner-only", () => {
    expect(can("OWNER", "payouts:request")).toBe(true);
    expect(can("ADMIN", "payouts:request")).toBe(false);
    expect(can("ADMIN", "payout-profiles:manage")).toBe(false);
    expect(can("EDITOR", "posts:publish")).toBe(true);
    expect(can("SUPPORT", "site:publish")).toBe(false);
  });
});

describe("payout details encryption", () => {
  const key = randomBytes(32).toString("base64");
  it("round-trips and detects tampering", () => {
    const enc = encryptJson({ walletId: "SC123456" }, key);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(decryptJson(enc, key)).toEqual({ walletId: "SC123456" });
    const parts = enc.split(".");
    const tampered = [parts[0], parts[1], parts[2], Buffer.from("x").toString("base64")].join(".");
    expect(() => decryptJson(tampered, key)).toThrow();
  });
  it("masks to the last four", () => {
    expect(maskTail("SY12 3456 7890")).toBe("•••• 7890");
  });
});
