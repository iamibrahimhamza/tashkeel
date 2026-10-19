"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ApiRequestError, createCheckout } from "@/lib/api";
import { getLocale } from "@/lib/locale";

export type BuyState = { error?: string; fieldErrors?: Partial<Record<"email" | "name", string>>; values?: { email: string; name: string } };

const Form = z.object({
  slug: z.string().min(1),
  productId: z.string().min(1),
  idempotencyKey: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(80).optional(),
});

export async function buyProduct(_prev: BuyState, formData: FormData): Promise<BuyState> {
  const locale = await getLocale();
  const ar = locale === "ar";
  const parsed = Form.safeParse(Object.fromEntries(formData));
  // Echoed back so a failed submit doesn't wipe what the buyer typed.
  const values = { email: String(formData.get("email") ?? ""), name: String(formData.get("name") ?? "") };
  if (!parsed.success) {
    const emailBad = parsed.error.issues.some((i) => i.path[0] === "email");
    return { values, fieldErrors: emailBad ? { email: ar ? "أدخل بريداً إلكترونياً صحيحاً" : "Enter a valid email" } : {}, error: emailBad ? undefined : ar ? "تعذّر إرسال الطلب" : "Could not submit" };
  }
  const f = parsed.data;

  let target: string;
  try {
    const session = await createCheckout(
      { workspaceSlug: f.slug, item: { kind: "product", productId: f.productId }, customer: { email: f.email, ...(f.name ? { name: f.name } : {}) }, locale },
      f.idempotencyKey,
      clientIp(await headers()),
    );
    target = session.checkoutUrl ?? `/${f.slug}/checkout/success?order=${session.orderId}`;
  } catch (e) {
    if (e instanceof ApiRequestError) {
      const msg = ar ? e.body?.error.messageAr ?? e.body?.error.message : e.body?.error.message;
      return { values, error: msg ?? (ar ? "تعذّر بدء الدفع، حاول مرة أخرى" : "Could not start checkout, please try again") };
    }
    return { values, error: ar ? "تعذّر بدء الدفع، حاول مرة أخرى" : "Could not start checkout, please try again" };
  }
  redirect(target);
}

function clientIp(h: Headers): string | undefined {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
}
