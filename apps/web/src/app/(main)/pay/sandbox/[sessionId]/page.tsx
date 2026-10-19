import { formatMoney } from "@tashkeel/core";
import { getDictionary } from "@tashkeel/i18n";
import { Logo } from "@tashkeel/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchSandboxSession } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { decide } from "./actions";

type Props = { params: Promise<{ sessionId: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sandbox checkout", robots: { index: false } };

/**
 * Stand-in for Stripe's hosted checkout while no Stripe account is connected. The API only
 * serves this when the sandbox gateway is active, so it 404s on a Stripe-connected server.
 */
export default async function SandboxCheckout({ params }: Props) {
  const { sessionId } = await params;
  const session = await fetchSandboxSession(sessionId);
  if (!session) notFound();
  const locale = await getLocale();
  const t = getDictionary(locale).sandbox;
  const open = session.kind === "subscription" || session.status === "PENDING";
  const amount = formatMoney(BigInt(session.amountMinor), session.currency, { locale });
  const act = decide.bind(null, sessionId, session.kind);

  return (
    <main className="min-h-dvh bg-sand">
      <div className="bg-forest py-2.5 text-center font-heading text-sm text-gold-light" role="status">
        {t.banner}
      </div>
      <div className="mx-auto max-w-md px-4 py-12">
        <Logo className="mb-10" />
        <div className="rounded-[18px] border border-line bg-paper p-7 shadow-[0_30px_80px_-50px_rgba(25,34,30,.5)]">
          <h1 className="font-display text-2xl">{t.title}</h1>
          <p className="mt-3 text-sm leading-7 text-muted">{t.body}</p>
          <div className="rule my-6" />
          <p className="text-sm text-muted">
            {t.to} {session.workspace.name}
          </p>
          <ul className="mt-2 space-y-1">
            {session.items.map((i) => (
              <li key={i.title} className="font-heading">
                {i.title}
                {session.kind === "subscription" && <span className="text-sm text-muted"> · {t.subscription}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-5 font-display text-4xl">{amount}</p>

          {open ? (
            <form className="mt-8 grid gap-3">
              <button formAction={act.bind(null, "approve")} className="rounded-full bg-ink py-3.5 font-heading font-medium text-paper transition hover:opacity-90">
                {t.approve}
              </button>
              <button formAction={act.bind(null, "decline")} className="rounded-full border border-ink/20 py-3.5 font-heading transition hover:border-ink/50">
                {t.decline}
              </button>
            </form>
          ) : (
            <p className="mt-8 rounded-lg bg-sand px-4 py-3 text-sm text-muted">{t.closed}</p>
          )}
        </div>
      </div>
    </main>
  );
}
