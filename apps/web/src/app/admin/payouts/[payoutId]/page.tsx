import type { PayoutDto } from "@tashkeel/contracts";
import { getDictionary } from "@tashkeel/i18n";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { dateTime, money, PageHeader, Panel, StatusBadge } from "@/components/dash";
import { api, ApiRequestError } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";

type Detail = PayoutDto & {
  workspace: { slug: string; name: string; country: string | null };
  destination: { label: string; details: Record<string, string> };
  events: Array<{ from: string | null; to: string; note: string | null; at: string }>;
};

async function transition(payoutId: string, form: FormData) {
  "use server";
  const { token } = await requireSession();
  const to = String(form.get("to"));
  const body =
    to === "APPROVED" ? { to, complianceChecked: true } : to === "PAID" ? { to, providerRef: String(form.get("providerRef") ?? "") } : { to, reason: String(form.get("reason") ?? "") };
  await api(`/v1/admin/payouts/${payoutId}`, { token, method: "PATCH", body });
  revalidatePath(`/admin/payouts/${payoutId}`);
}

const input = "rounded-xl border border-line bg-paper px-4 py-2.5 text-sm focus:border-accent focus:outline-none";

export default async function AdminPayoutDetail({ params }: { params: Promise<{ payoutId: string }> }) {
  const { payoutId } = await params;
  const { token } = await requireSession(`/admin/payouts/${payoutId}`);
  const locale = await getLocale();
  const t = getDictionary(locale);
  const a = t.dash.admin;
  let p: Detail;
  try {
    // Viewing this page reveals the destination account; the API records an audit entry.
    p = await api<Detail>(`/v1/admin/payouts/${payoutId}`, { token });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
  const act = transition.bind(null, p.id);
  const open = p.status === "REQUESTED" || p.status === "APPROVED" || p.status === "PROCESSING";

  return (
    <>
      <PageHeader title={`${money(p.amountMinor, p.currency, locale)} · ${p.workspace.name}`} action={<StatusBadge status={p.status} t={t} />} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={a.destination}>
          <dl className="divide-y divide-line">
            <div className="flex justify-between gap-4 px-6 py-3"><dt className="text-muted">{t.dash.table.method}</dt><dd className="font-heading">{p.method}</dd></div>
            {Object.entries(p.destination.details).filter(([k]) => k !== "method").map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-6 py-3"><dt className="text-muted">{k}</dt><dd className="font-heading" dir="ltr">{v}</dd></div>
            ))}
          </dl>
        </Panel>

        <Panel title={a.history}>
          <ol className="divide-y divide-line">
            {p.events.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
                <StatusBadge status={e.to} t={t} />
                <span className="text-muted">{e.note ?? ""}</span>
                <span className="text-muted">{dateTime(e.at, locale, true)}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {open && (
        <Panel className="mt-6">
          <div className="grid gap-6 p-6">
            {p.status === "REQUESTED" && (
              <form action={act}>
                <input type="hidden" name="to" value="APPROVED" />
                <button className="rounded-full bg-ink px-6 py-2.5 font-heading text-sm text-paper">{a.approve}</button>
              </form>
            )}
            {(p.status === "APPROVED" || p.status === "PROCESSING") && (
              <form action={act} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="to" value="PAID" />
                <label className="grid gap-1.5 text-sm">
                  <span className="font-heading">{a.reference}</span>
                  <input name="providerRef" required minLength={3} dir="ltr" className={input} />
                </label>
                <button className="rounded-full bg-ink px-6 py-2.5 font-heading text-sm text-paper">{a.markPaid}</button>
              </form>
            )}
            <form action={act} className="flex flex-wrap items-end gap-3 border-t border-line pt-6">
              <input type="hidden" name="to" value="FAILED" />
              <label className="grid gap-1.5 text-sm">
                <span className="font-heading">{a.reason}</span>
                <input name="reason" required minLength={3} className={input} />
              </label>
              <button className="rounded-full border border-red-300 px-6 py-2.5 font-heading text-sm text-red-800">{a.fail}</button>
            </form>
          </div>
        </Panel>
      )}
    </>
  );
}
