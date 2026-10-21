"use client";

import type { Dictionary } from "@tashkeel/i18n";
import { LogoMark } from "@tashkeel/ui";
import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "./actions";

const input = "w-full rounded-xl border border-line bg-paper px-4 py-3 text-[0.95rem] focus:border-accent focus:outline-none aria-[invalid=true]:border-red-700";

export function WaitlistForm({ t }: { t: Dictionary["waitlist"] }) {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, {});

  if (state.ok) {
    return (
      <div role="status" className="flex flex-col items-center py-10 text-center">
        <LogoMark size={40} />
        <p className="mt-6 font-display text-2xl">{t.success}</p>
        <p className="mt-2 text-muted">{t.successBody}</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-3" noValidate>
      <label className="grid gap-1.5">
        <span className="font-heading text-xs text-muted">{t.name}</span>
        <input name="name" required autoComplete="name" defaultValue={state.values?.name} aria-invalid={!!state.fieldErrors?.name} className={input} />
      </label>
      <label className="grid gap-1.5">
        <span className="font-heading text-xs text-muted">{t.email}</span>
        <input name="email" type="email" required dir="ltr" autoComplete="email" defaultValue={state.values?.email} aria-invalid={!!state.fieldErrors?.email} className={`${input} text-end`} />
      </label>
      <label className="grid gap-1.5">
        <span className="font-heading text-xs text-muted">{t.specialty}</span>
        <input name="specialty" placeholder={t.specialtyPlaceholder} defaultValue={state.values?.specialty} className={input} />
      </label>
      <label className="grid gap-1.5">
        <span className="font-heading text-xs text-muted">{t.link}</span>
        <input name="link" dir="ltr" inputMode="url" placeholder="linkedin.com/in/…" defaultValue={state.values?.link} aria-invalid={!!state.fieldErrors?.link} className={`${input} text-end`} />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800">{state.error}</p>}
      <button disabled={pending} className="mt-1 rounded-full bg-ink py-3.5 font-heading font-medium text-paper transition hover:opacity-90 disabled:opacity-60">
        {pending ? t.pending : t.submit}
      </button>
      <p className="text-center text-xs text-muted">{t.privacy}</p>
    </form>
  );
}
