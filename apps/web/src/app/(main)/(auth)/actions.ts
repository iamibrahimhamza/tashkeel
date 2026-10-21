"use server";

import { getDictionary } from "@tashkeel/i18n";
import { redirect } from "next/navigation";
import { apiPublic, errorMessage } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { clearSession, setSession } from "@/lib/session";

export type FormState = { error?: string; values?: Record<string, string> };

type Session = { accessToken: string; expiresIn: number };

/** Only same-site relative paths are honoured, so ?next= can't send users off-site. */
function safeNext(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : null;
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const locale = await getLocale();
  const email = String(form.get("email") ?? "");
  try {
    const s = await apiPublic<Session>("/v1/auth/login", { email, password: String(form.get("password") ?? "") });
    await setSession(s.accessToken, s.expiresIn);
  } catch (e) {
    return { error: errorMessage(e, locale, getDictionary(locale).auth.failed), values: { email } };
  }
  redirect(safeNext(form.get("next")) ?? "/dashboard");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}
