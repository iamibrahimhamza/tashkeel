"use client";

import { useActionState, useState } from "react";
import type { PayoutFormState } from "./actions";

type Action = (s: PayoutFormState, f: FormData) => Promise<PayoutFormState>;

const input = "w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm focus:border-accent focus:outline-none";

function Feedback({ state, okText }: { state: PayoutFormState; okText: string }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800">{state.error}</p>;
  if (state.ok) return <p role="status" className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{okText}</p>;
  return null;
}

export function RequestPayoutForm({ action, profiles, labels }: { action: Action; profiles: Array<{ id: string; label: string; maskedHint: string }>; labels: { amount: string; to: string; submit: string; minimum: string; ok: string } }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
      <input type="hidden" name="currency" value="USD" />
      <label className="grid gap-1.5 text-sm">
        <span className="font-heading">{labels.amount} (USD)</span>
        <input name="amount" inputMode="decimal" required dir="ltr" placeholder="0.00" className={input} />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="font-heading">{labels.to}</span>
        <select name="profileId" required className={input}>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} · {p.maskedHint}
            </option>
          ))}
        </select>
      </label>
      <button disabled={pending} className="rounded-full bg-ink px-6 py-2.5 font-heading text-sm text-paper disabled:opacity-60">{labels.submit}</button>
      <p className="text-xs text-muted sm:col-span-3">{labels.minimum}</p>
      <div className="sm:col-span-3">
        <Feedback state={state} okText={labels.ok} />
      </div>
    </form>
  );
}

const METHODS = {
  AL_BARAKA: { ar: "بنك البركة", en: "Al Baraka Bank" },
  SHAM_CASH: { ar: "شام كاش", en: "Sham Cash" },
  WALLET: { ar: "محفظة رقمية", en: "Digital wallet" },
  BANK_WIRE: { ar: "تحويل بنكي دولي", en: "International wire" },
} as const;

const FIELDS: Record<keyof typeof METHODS, Array<{ name: string; ar: string; en: string; ltr?: boolean; options?: string[] }>> = {
  AL_BARAKA: [
    { name: "accountHolder", ar: "اسم صاحب الحساب", en: "Account holder" },
    { name: "accountNumber", ar: "رقم الحساب", en: "Account number", ltr: true },
    { name: "branch", ar: "الفرع (اختياري)", en: "Branch (optional)" },
    { name: "country", ar: "الدولة", en: "Country", options: ["SY", "LB", "IQ", "JO", "TR", "SA", "AE", "EG", "BH"] },
  ],
  SHAM_CASH: [
    { name: "fullName", ar: "الاسم الكامل", en: "Full name" },
    { name: "walletId", ar: "رقم المحفظة", en: "Wallet ID", ltr: true },
    { name: "phone", ar: "رقم الهاتف", en: "Phone", ltr: true },
  ],
  WALLET: [
    { name: "provider", ar: "المزوّد", en: "Provider", options: ["USDT_TRC20", "WISE", "PAYONEER", "ZAIN_CASH", "WHISH"] },
    { name: "address", ar: "العنوان أو المعرّف", en: "Address or ID", ltr: true },
  ],
  BANK_WIRE: [
    { name: "accountHolder", ar: "اسم صاحب الحساب", en: "Account holder" },
    { name: "iban", ar: "IBAN", en: "IBAN", ltr: true },
    { name: "swift", ar: "SWIFT", en: "SWIFT", ltr: true },
    { name: "bankName", ar: "اسم البنك", en: "Bank name" },
  ],
};

export function AddProfileForm({ action, locale, labels }: { action: Action; locale: "ar" | "en"; labels: { label: string; submit: string; ok: string } }) {
  const [method, setMethod] = useState<keyof typeof METHODS>("SHAM_CASH");
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-4">
      <fieldset className="flex flex-wrap gap-2">
        {(Object.keys(METHODS) as Array<keyof typeof METHODS>).map((m) => (
          <label key={m} className={`cursor-pointer rounded-full border px-4 py-2 font-heading text-sm transition ${m === method ? "border-accent bg-sand" : "border-line"}`}>
            <input type="radio" name="method" value={m} checked={m === method} onChange={() => setMethod(m)} className="sr-only" />
            {METHODS[m][locale]}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-heading">{labels.label}</span>
          <input name="label" required className={input} />
        </label>
        {FIELDS[method].map((f) => (
          <label key={`${method}-${f.name}`} className="grid gap-1.5 text-sm">
            <span className="font-heading">{f[locale]}</span>
            {f.options ? (
              <select name={f.name} className={input}>
                {f.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input name={f.name} dir={f.ltr ? "ltr" : undefined} required={!f.name.startsWith("branch")} className={input} />
            )}
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isDefault" defaultChecked />
        {locale === "ar" ? "اجعلها الوسيلة الافتراضية" : "Make default"}
      </label>
      <Feedback state={state} okText={labels.ok} />
      <button disabled={pending} className="justify-self-start rounded-full border border-ink/20 px-6 py-2.5 font-heading text-sm hover:border-ink/50 disabled:opacity-60">{labels.submit}</button>
    </form>
  );
}
