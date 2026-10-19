"use server";

import { parseMajor } from "@tashkeel/core";
import { getDictionary } from "@tashkeel/i18n";
import { revalidatePath } from "next/cache";
import { api, errorMessage } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";

export type PayoutFormState = { ok?: boolean; error?: string };

const DETAIL_FIELDS: Record<string, string[]> = {
  AL_BARAKA: ["accountHolder", "accountNumber", "branch", "country"],
  SHAM_CASH: ["fullName", "walletId", "phone"],
  WALLET: ["provider", "address"],
  BANK_WIRE: ["accountHolder", "iban", "swift", "bankName"],
};

export async function addProfile(workspaceId: string, _prev: PayoutFormState, form: FormData): Promise<PayoutFormState> {
  const { token } = await requireSession();
  const locale = await getLocale();
  const method = String(form.get("method") ?? "");
  const details: Record<string, string> = { method };
  for (const f of DETAIL_FIELDS[method] ?? []) {
    const v = String(form.get(f) ?? "").trim();
    if (v) details[f] = v;
  }
  try {
    await api(`/v1/workspaces/${workspaceId}/payout-profiles`, { token, method: "POST", body: { label: String(form.get("label") ?? ""), details, isDefault: form.get("isDefault") === "on" } });
  } catch (e) {
    return { error: errorMessage(e, locale, getDictionary(locale).auth.failed) };
  }
  revalidatePath(`/dashboard/${workspaceId}/payouts`);
  return { ok: true };
}

export async function requestPayout(workspaceId: string, idempotencyKey: string, _prev: PayoutFormState, form: FormData): Promise<PayoutFormState> {
  const { token } = await requireSession();
  const locale = await getLocale();
  const currency = String(form.get("currency") ?? "USD");
  try {
    const amountMinor = parseMajor(String(form.get("amount") ?? ""), currency).toString();
    await api(`/v1/workspaces/${workspaceId}/payouts`, { token, method: "POST", idempotencyKey, body: { profileId: String(form.get("profileId") ?? ""), amountMinor, currency } });
  } catch (e) {
    return { error: errorMessage(e, locale, locale === "ar" ? "أدخل مبلغاً صحيحاً" : "Enter a valid amount") };
  }
  revalidatePath(`/dashboard/${workspaceId}/payouts`);
  return { ok: true };
}

export async function cancelPayout(workspaceId: string, payoutId: string) {
  const { token } = await requireSession();
  await api(`/v1/workspaces/${workspaceId}/payouts/${payoutId}/cancel`, { token, method: "POST" });
  revalidatePath(`/dashboard/${workspaceId}/payouts`);
}
