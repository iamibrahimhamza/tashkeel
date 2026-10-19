import type { PayoutDto } from "@tashkeel/contracts";
import { getDictionary } from "@tashkeel/i18n";
import { dateTime, EmptyState, money, PageHeader, Panel, StatusBadge, Table, Td } from "@/components/dash";
import { api } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";

type Row = PayoutDto & { workspace: { slug: string; name: string; country: string | null } };

/** Open payout requests, oldest first — the manual-ops work queue. */
export default async function AdminPayouts() {
  const { token } = await requireSession("/admin");
  const locale = await getLocale();
  const t = getDictionary(locale);
  const { data } = await api<{ data: Row[] }>("/v1/admin/payouts", { token });
  const c = t.dash.table;
  return (
    <>
      <PageHeader title={t.dash.admin.payouts} />
      <Panel>
        {data.length === 0 ? (
          <EmptyState icon="payouts" title={t.dash.empty.adminPayouts.title} body={t.dash.empty.adminPayouts.body} />
        ) : (
          <Table head={[c.date, c.expert, c.amount, c.method, c.status]}>
            {data.map((p) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap text-muted">{dateTime(p.createdAt, locale)}</Td>
                <Td>
                  <a href={`/admin/payouts/${p.id}`} className="font-heading hover:text-accent">{p.workspace.name}</a>
                </Td>
                <Td className="font-heading">{money(p.amountMinor, p.currency, locale)}</Td>
                <Td>{p.method}</Td>
                <Td>
                  <StatusBadge status={p.status} t={t} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
