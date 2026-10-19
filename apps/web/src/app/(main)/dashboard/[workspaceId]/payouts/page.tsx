import { randomUUID } from "node:crypto";
import { dateTime, EmptyState, money, PageHeader, Panel, StatusBadge, Table, Td } from "@/components/dash";
import { BalanceCards } from "../balance-cards";
import { workspaceContext } from "../context";
import { dashboardData } from "../data";
import { addProfile, cancelPayout, requestPayout } from "./actions";
import { AddProfileForm, RequestPayoutForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function Payouts({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { token, workspace, t, locale } = await workspaceContext(workspaceId);
  const isOwner = workspace.role === "OWNER";
  const data = dashboardData(token, workspace.id);
  const [balances, payouts, profiles] = await Promise.all([data.balances(), data.payouts(), isOwner ? data.profiles() : Promise.resolve([])]);
  const p = t.dash.payouts;
  const c = t.dash.table;
  const ok = locale === "ar" ? "تم الحفظ" : "Saved";

  return (
    <>
      <PageHeader title={p.title} />
      <BalanceCards balances={balances} currency="USD" t={t} locale={locale} />

      {isOwner && profiles.length > 0 && (
        <Panel className="mt-8" title={p.request}>
          <div className="p-6">
            {/* A fresh key per render: a double-click can't create two payouts. */}
            <RequestPayoutForm action={requestPayout.bind(null, workspace.id, randomUUID())} profiles={profiles} labels={{ amount: p.amount, to: p.to, submit: p.submit, minimum: p.minimum, ok }} />
          </div>
        </Panel>
      )}

      <Panel className="mt-8" title={p.history}>
        {payouts.length === 0 ? (
          <EmptyState icon="payouts" title={t.dash.empty.payouts.title} body={t.dash.empty.payouts.body} />
        ) : (
          <Table head={[c.date, c.amount, c.method, c.reference, c.status, ""]}>
            {payouts.map((x) => (
              <tr key={x.id}>
                <Td className="whitespace-nowrap text-muted">{dateTime(x.createdAt, locale)}</Td>
                <Td className="font-heading">{money(x.amountMinor, x.currency, locale)}</Td>
                <Td>{x.method}</Td>
                <Td>
                  <span dir="ltr">{x.providerRef ?? "—"}</span>
                </Td>
                <Td>
                  <StatusBadge status={x.status} t={t} />
                </Td>
                <Td>
                  {isOwner && x.status === "REQUESTED" && (
                    <form action={cancelPayout.bind(null, workspace.id, x.id)}>
                      <button className="font-heading text-xs text-muted hover:text-ink">{p.cancel}</button>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      {isOwner && (
        <Panel className="mt-8" title={p.profiles}>
          {profiles.length === 0 ? (
            <EmptyState icon="payouts" title={t.dash.empty.profiles.title} body={t.dash.empty.profiles.body} />
          ) : (
            <ul className="divide-y divide-line">
              {profiles.map((x) => (
                <li key={x.id} className="flex items-center justify-between px-6 py-4">
                  <span className="font-heading">{x.label}</span>
                  <span className="text-sm text-muted" dir="ltr">
                    {x.method} · {x.maskedHint}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line p-6">
            <h3 className="mb-4 font-heading text-sm font-semibold">{p.addProfile}</h3>
            <AddProfileForm action={addProfile.bind(null, workspace.id)} locale={locale} labels={{ label: p.label, submit: p.saveProfile, ok }} />
          </div>
        </Panel>
      )}
    </>
  );
}
