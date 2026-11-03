"use client";

import { useActionState, useState, useTransition } from "react";
import { resendLinks, startDownload } from "./actions";

export function DownloadButton({ token, fileId, label, busyLabel }: { token: string; fileId: string; label: string; busyLabel: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="grid justify-items-end gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await startDownload(token, fileId);
            if ("error" in r) return setError(r.error);
            window.location.assign(r.url);
          })
        }
        className="rounded-full bg-ink px-5 py-2 font-heading text-sm text-paper disabled:opacity-60"
      >
        {busy ? busyLabel : label}
      </button>
      {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
    </div>
  );
}

export function ResendForm({ labels }: { labels: { email: string; resend: string; resent: string } }) {
  const [state, action, pending] = useActionState(resendLinks, {});
  if (state.sent) return <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-800">{labels.resent}</p>;
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1.5 text-sm">
        <span className="font-heading text-xs text-muted">{labels.email}</span>
        <input name="email" type="email" required dir="ltr" className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm focus:border-accent focus:outline-none" />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800">{state.error}</p>}
      <button disabled={pending} className="justify-self-start rounded-full bg-ink px-6 py-2.5 font-heading text-sm text-paper disabled:opacity-60">{labels.resend}</button>
    </form>
  );
}
