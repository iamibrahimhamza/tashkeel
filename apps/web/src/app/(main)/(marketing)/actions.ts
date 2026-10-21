"use server";

import { JoinWaitlistInput } from "@tashkeel/contracts";
import { getDictionary } from "@tashkeel/i18n";
import { headers } from "next/headers";
import { getLocale } from "@/lib/locale";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type WaitlistState = { ok?: boolean; error?: string; fieldErrors?: Partial<Record<"name" | "email" | "link", true>>; values?: Record<string, string> };

export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const locale = await getLocale();
  const t = getDictionary(locale).waitlist;
  const values = Object.fromEntries(["name", "email", "specialty", "link"].map((k) => [k, String(form.get(k) ?? "").trim()]));
  const parsed = JoinWaitlistInput.safeParse({
    name: values.name,
    email: values.email,
    specialty: values.specialty || undefined,
    link: values.link || undefined,
    locale,
    source: "landing",
  });
  if (!parsed.success) {
    const keys = new Set(parsed.error.issues.map((i) => String(i.path[0])));
    return { values, error: t.error, fieldErrors: { name: keys.has("name") || undefined, email: keys.has("email") || undefined, link: keys.has("link") || undefined } };
  }
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  try {
    const res = await fetch(`${API_URL}/v1/public/waitlist`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}) },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) return { values, error: t.error };
  } catch {
    return { values, error: t.error };
  }
  return { ok: true };
}
