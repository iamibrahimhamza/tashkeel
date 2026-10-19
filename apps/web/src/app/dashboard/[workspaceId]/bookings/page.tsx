import { dateTime, EmptyState, PageHeader, Panel, StatusBadge, Table, Td } from "@/components/dash";
import { workspaceContext } from "../context";
import { dashboardData } from "../data";

export default async function Bookings({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { token, workspace, t, locale } = await workspaceContext(workspaceId);
  const bookings = await dashboardData(token, workspace.id).bookings();
  const c = t.dash.table;
  return (
    <>
      <PageHeader title={t.dash.nav.bookings} />
      <Panel>
        {bookings.length === 0 ? (
          <EmptyState icon="bookings" title={t.dash.empty.bookings.title} body={t.dash.empty.bookings.body} />
        ) : (
          <Table head={[c.when, c.session, c.client, c.status]}>
            {bookings.map((b) => (
              <tr key={b.id}>
                <Td className="whitespace-nowrap">{dateTime(b.startsAt, locale, true)}</Td>
                <Td className="font-heading">{b.serviceTitle}</Td>
                <Td>{b.customer.name ?? b.customer.email}</Td>
                <Td>
                  <StatusBadge status={b.status} t={t} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
