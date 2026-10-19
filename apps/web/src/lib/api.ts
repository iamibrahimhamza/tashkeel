import { CheckoutOrderStatus, CheckoutSession, PublicHome, PublicProductPage, type ApiError, type CreateCheckoutInput } from "@tashkeel/contracts";
import "server-only";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.error.message ?? `API request failed with ${status}`);
  }
}

async function get(path: string, init?: RequestInit & { next?: { revalidate?: number; tags?: string[] } }) {
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { accept: "application/json", ...init?.headers } });
  if (!res.ok) throw new ApiRequestError(res.status, (await res.json().catch(() => null)) as ApiError | null);
  return res.json() as Promise<unknown>;
}

/**
 * Published home for /[slug]. The API response is validated against the shared contract
 * before rendering; it is cached briefly and revalidated on publish via the `home:<slug>` tag.
 */
export async function fetchPublicHome(slug: string): Promise<PublicHome | null> {
  try {
    const data = await get(`/v1/public/homes/${encodeURIComponent(slug)}`, { next: { revalidate: 60, tags: [`home:${slug}`] } });
    return PublicHome.parse(data);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) return null;
    throw e;
  }
}

export async function fetchPublicProduct(slug: string, productSlug: string): Promise<PublicProductPage | null> {
  try {
    const data = await get(`/v1/public/homes/${encodeURIComponent(slug)}/products/${encodeURIComponent(productSlug)}`, { next: { revalidate: 60, tags: [`home:${slug}`] } });
    return PublicProductPage.parse(data);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) return null;
    throw e;
  }
}

export async function fetchOrderStatus(orderId: string): Promise<CheckoutOrderStatus | null> {
  try {
    return CheckoutOrderStatus.parse(await get(`/v1/checkout/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" }));
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) return null;
    throw e;
  }
}

/** The idempotency key is minted once per rendered form, so double-submits create one order. */
export async function createCheckout(input: CreateCheckoutInput, idempotencyKey: string, clientIp?: string): Promise<CheckoutSession> {
  const res = await fetch(`${API_URL}/v1/checkout/sessions`, {
    method: "POST",
    cache: "no-store",
    // The API trusts one proxy hop, so per-buyer rate limits see the buyer, not this server.
    headers: { "content-type": "application/json", accept: "application/json", "idempotency-key": idempotencyKey, ...(clientIp ? { "x-forwarded-for": clientIp } : {}) },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiError | null);
  return CheckoutSession.parse(body);
}
