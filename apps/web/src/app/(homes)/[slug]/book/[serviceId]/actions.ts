"use server";

import { BookingHold, type ApiError } from "@tashkeel/contracts";
import { headers } from "next/headers";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type HoldResult = { ok: true; redirectTo: string } | { ok: false; error: string; slotTaken: boolean };

/**
 * Holds the chosen slot and returns where to send the buyer: the gateway's checkout (Sandbox or
 * Stripe), or straight to confirmation for free sessions. The idempotency key is minted once per
 * booking form, so a double-click never creates two holds.
 */
export async function holdSlot(input: {
  slug: string;
  serviceId: string;
  startsAt: string;
  customerTz: string;
  customer: { name: string; email: string; phone?: string };
  notes?: string;
  idempotencyKey: string;
  locale: "ar" | "en";
}): Promise<HoldResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  const res = await fetch(`${API_URL}/v1/public/bookings`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json", accept: "application/json", "idempotency-key": input.idempotencyKey, ...(ip ? { "x-forwarded-for": ip } : {}) },
    body: JSON.stringify({
      serviceId: input.serviceId,
      startsAt: input.startsAt,
      customerTz: input.customerTz,
      locale: input.locale,
      customer: { name: input.customer.name, email: input.customer.email, ...(input.customer.phone ? { phone: input.customer.phone } : {}) },
      ...(input.notes ? { notes: input.notes } : {}),
    }),
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (body as ApiError | null)?.error;
    const msg = (input.locale === "ar" ? err?.messageAr : undefined) ?? err?.message ?? (input.locale === "ar" ? "تعذّر الحجز، حاول مرة أخرى" : "Could not book, please try again");
    return { ok: false, error: msg, slotTaken: err?.code === "SLOT_UNAVAILABLE" };
  }
  const hold = BookingHold.parse(body);
  return { ok: true, redirectTo: hold.checkoutUrl ?? `/${input.slug}/checkout/success?order=${hold.orderId}` };
}
