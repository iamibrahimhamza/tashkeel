import { createHash } from "node:crypto";

/** Deterministic JSON (sorted keys) so semantically equal bodies hash equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return typeof value === "bigint" ? JSON.stringify(value.toString()) : JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function hashRequest(method: string, path: string, body: unknown): string {
  return createHash("sha256").update(`${method.toUpperCase()} ${path}\n${stableStringify(body)}`).digest("hex");
}

/** Keys must outlive the longest re-delivery path (7-day DLQ replay) with margin. */
export const IDEMPOTENCY_TTL_MS = 30 * 86_400_000;

/** Keys for calls *we* make to providers are derived from immutable intent ids, never per attempt. */
export const providerIdempotencyKey = {
  checkoutSession: (orderId: string) => `checkout:v1:${orderId}`,
  refund: (orderId: string, refundRequestId: string) => `refund:v1:${orderId}:${refundRequestId}`,
  transfer: (payoutId: string) => `payout:v1:${payoutId}`,
};
