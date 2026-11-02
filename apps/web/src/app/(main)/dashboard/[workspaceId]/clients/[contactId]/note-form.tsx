"use client";

import { useActionState, useEffect, useRef } from "react";
import type { NoteFormState } from "./actions";

type Action = (s: NoteFormState, f: FormData) => Promise<NoteFormState>;

export function NoteForm({ action, labels }: { action: Action; labels: { placeholder: string; submit: string } }) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.at, state.ok]);

  return (
    <form ref={ref} action={formAction} className="grid gap-3">
      <textarea
        name="body"
        required
        rows={4}
        maxLength={5000}
        placeholder={labels.placeholder}
        className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm leading-7 focus:border-accent focus:outline-none"
      />
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800">{state.error}</p>}
      <button disabled={pending} className="justify-self-start rounded-full bg-ink px-6 py-2.5 font-heading text-sm text-paper disabled:opacity-60">{labels.submit}</button>
    </form>
  );
}
