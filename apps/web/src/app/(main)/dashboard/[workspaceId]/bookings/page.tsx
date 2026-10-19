import type { BookingDto, WorkspaceDto } from "@tashkeel/contracts";
import { intlLocale } from "@tashkeel/core/money";
import { EmptyState, PageHeader, Panel, StatusBadge, Table, Td } from "@/components/dash";
import { api } from "@/lib/api";
import { tzLabel } from "@/lib/timezones";
import { workspaceContext } from "../context";
import { dashboardData } from "../data";

export const dynamic = "force-dynamic";

export default async function Bookings({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { token, workspace, t, locale, base } = await workspaceContext(workspaceId);
  const [bookings, ws] = await Promise.all([dashboardData(token, workspace.id).bookings(), api<WorkspaceDto>(`/v1/workspaces/${workspace.id}`, { token })]);
  const now = Date.now();
  const upcoming = bookings.filter((b) => Date.parse(b.endsAt) >= now && b.status === "CONFIRMED").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = bookings.filter((b) => !upcoming.includes(b));
  const ar = locale === "ar";
  // Expert's own clock, with the client's local time alongside so both sides agree.
  const fmt = (iso: string, tz: string) => new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));

  const table = (rows: BookingDto[]) => (
    <Table head={[t.dash.table.when, ar ? "توقيت العميل" : "Client's time", t.dash.table.session, t.dash.table.client, t.dash.table.status]}>
      {rows.map((b) => (
        <tr key={b.id}>
          <Td className="whitespace-nowrap font-heading">{fmt(b.startsAt, ws.timezone)}</Td>
          <Td className="whitespace-nowrap text-muted">
            {fmt(b.startsAt, b.customerTz)} · {tzLabel(b.customerTz, locale)}
          </Td>
          <Td>{b.serviceTitle}</Td>
          <Td>
            <span className="block">{b.customer.name ?? "—"}</span>
            <span className="text-xs text-muted" dir="ltr">{b.customer.email}</span>
          </Td>
          <Td>
            <StatusBadge status={b.status} t={t} />
          </Td>
        </tr>
      ))}
    </Table>
  );

  return (
    <>
      <PageHeader title={t.dash.nav.bookings} lead={`${ar ? "الأوقات بتوقيت" : "Times in"} ${tzLabel(ws.timezone, locale)}`} />
      <Panel title={ar ? "الجلسات القادمة" : "Upcoming sessions"}>
        {upcoming.length ? (
          table(upcoming)
        ) : (
          <EmptyState icon="bookings" title={t.dash.empty.bookings.title} body={t.dash.empty.bookings.body}>
            <a href={`${base}/services`} className="font-heading text-sm text-accent">{t.dash.nav.services} ←</a>
          </EmptyState>
        )}
      </Panel>
      {past.length > 0 && (
        <Panel className="mt-8" title={ar ? "السابقة والملغاة" : "Past & cancelled"}>
          {table(past)}
        </Panel>
      )}
    </>
  );
}
