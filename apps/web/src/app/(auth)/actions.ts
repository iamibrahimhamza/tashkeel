"use server";

import { getDictionary } from "@tashkeel/i18n";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { api, apiPublic, errorMessage } from "@/lib/api";
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

/** Creates the account and its workspace (the claimed link) in one step. */
export async function signup(_prev: FormState, form: FormData): Promise<FormState> {
  const locale = await getLocale();
  const values = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), slug: String(form.get("slug") ?? "").toLowerCase() };
  let workspaceId: string;
  try {
    const s = await apiPublic<Session>("/v1/auth/signup", { name: values.name, email: values.email, password: String(form.get("password") ?? ""), locale });
    await setSession(s.accessToken, s.expiresIn);
    const ws = await api<{ id: string }>("/v1/workspaces", { token: s.accessToken, method: "POST", idempotencyKey: randomUUID(), body: { name: values.name, slug: values.slug } });
    workspaceId = ws.id;
  } catch (e) {
    return { error: errorMessage(e, locale, getDictionary(locale).auth.failed), values };
  }
  redirect(`/dashboard/${workspaceId}`);
}

export async function logout() {
  await clearSession();
  redirect("/login");
}
