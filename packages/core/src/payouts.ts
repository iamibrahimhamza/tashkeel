import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Smallest withdrawal per currency, in minor units. Keeps manual-ops transfers worth their cost. */
export const MIN_PAYOUT_MINOR: Readonly<Record<string, bigint>> = { USD: 2000n, EUR: 2000n };
export const DEFAULT_MIN_PAYOUT_MINOR = 2000n;

export function minPayout(currency: string): bigint {
  return MIN_PAYOUT_MINOR[currency] ?? DEFAULT_MIN_PAYOUT_MINOR;
}

/** Rails that are executed by Tashkeel staff and confirmed with a reference + receipt. */
export const MANUAL_RAILS = ["AL_BARAKA", "SHAM_CASH", "WALLET", "BANK_WIRE"] as const;
export type ManualRail = (typeof MANUAL_RAILS)[number];

// ── Payout details at rest: AES-256-GCM ──────────────
// Format: v1.<iv b64>.<tag b64>.<ciphertext b64>. The version prefix allows key rotation.

export function encryptJson(value: unknown, keyB64: string): string {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("encryption key must be 32 bytes (base64)");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${ct.toString("base64")}`;
}

export function decryptJson<T = unknown>(payload: string, keyB64: string): T {
  const [v, ivB64, tagB64, ctB64] = payload.split(".");
  if (v !== "v1" || !ivB64 || !tagB64 || !ctB64) throw new Error("unsupported ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}

/** Last 4 characters only, e.g. "•••• 4821". Never reveals more of an account identifier. */
export function maskTail(value: string): string {
  const clean = value.replace(/\s+/g, "");
  return `•••• ${clean.slice(-4)}`;
}
