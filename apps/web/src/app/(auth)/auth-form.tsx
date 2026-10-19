"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "./actions";

export type Field = { name: string; label: string; type?: string; hint?: string; dir?: "ltr" | "rtl"; autoComplete?: string; defaultValue?: string; prefix?: string };

export function AuthForm({ action, fields, submit, hidden, footer }: { action: (s: FormState, f: FormData) => Promise<FormState>; fields: Field[]; submit: string; hidden?: Record<string, string>; footer?: ReactNode }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-4">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields.map((f) => (
        <label key={f.name} className="grid gap-1.5 text-sm">
          <span className="font-heading">{f.label}</span>
          <span className="flex items-center rounded-xl border border-line bg-paper focus-within:border-accent" dir={f.dir}>
            {f.prefix && <span className="select-none ps-4 text-muted">{f.prefix}</span>}
            <input
              name={f.name}
              type={f.type ?? "text"}
              required
              dir={f.dir}
              autoComplete={f.autoComplete}
              defaultValue={state.values?.[f.name] ?? f.defaultValue}
              className="min-w-0 flex-1 bg-transparent px-4 py-3 outline-none"
            />
          </span>
          {f.hint && <span className="text-xs text-muted">{f.hint}</span>}
        </label>
      ))}
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</p>}
      <button disabled={pending} className="mt-2 rounded-full bg-ink py-3.5 font-heading font-medium text-paper transition hover:opacity-90 disabled:opacity-60">
        {submit}
      </button>
      {footer}
    </form>
  );
}
