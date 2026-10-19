"use client";

import { useActionState } from "react";
import { buyProduct, type BuyState } from "./actions";

type Labels = { email: string; name: string; submit: string; pending: string; secure: string };

export function BuyForm({ slug, productId, idempotencyKey, labels }: { slug: string; productId: string; idempotencyKey: string; labels: Labels }) {
  const [state, action, pending] = useActionState<BuyState, FormData>(buyProduct, {});
  return (
    <form action={action} className="grid gap-3" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <label className="grid gap-1.5 text-sm">
        <span className="font-heading">{labels.name}</span>
        <input name="name" autoComplete="name" defaultValue={state.values?.name} className="rounded-[calc(var(--radius)/1.5)] border border-line bg-paper px-4 py-3 focus:border-accent focus:outline-none" />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="font-heading">{labels.email}</span>
        <input
          name="email"
          type="email"
          defaultValue={state.values?.email}
          required
          dir="ltr"
          autoComplete="email"
          aria-invalid={!!state.fieldErrors?.email}
          aria-describedby={state.fieldErrors?.email ? "email-err" : undefined}
          className="rounded-[calc(var(--radius)/1.5)] border border-line bg-paper px-4 py-3 text-end focus:border-accent focus:outline-none aria-[invalid=true]:border-red-700"
        />
        {state.fieldErrors?.email && <span id="email-err" className="text-red-700">{state.fieldErrors.email}</span>}
      </label>

      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</p>}

      <button disabled={pending} className="mt-2 rounded-full bg-ink px-6 py-3.5 font-heading font-medium text-paper transition hover:opacity-90 disabled:opacity-60">
        {pending ? labels.pending : labels.submit}
      </button>
      <p className="text-center text-xs text-muted">{labels.secure}</p>
    </form>
  );
}
