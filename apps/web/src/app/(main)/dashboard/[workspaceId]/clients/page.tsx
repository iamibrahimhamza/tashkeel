import Link from "next/link";
import { dateTime, EmptyState, money, PageHeader, Panel, Table, Td } from "@/components/dash";
import { workspaceContext } from "../context";
import { dashboardData } from "../data";

export default async function Clients({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { token, workspace, t, locale, base } = await workspaceContext(workspaceId);
  const { data } = await dashboardData(token, workspace.id).contacts();
  const c = t.dash.table;
  return (
    <>
      <PageHeader title={t.dash.nav.clients} />
      <Panel>
        {data.length === 0 ? (
          <EmptyState icon="clients" title={t.dash.empty.clients.title} body={t.dash.empty.clients.body} />
        ) : (
          <Table head={[t.auth.name, c.email, c.lifetime, c.lastSeen]}>
            {data.map((x) => (
              <tr key={x.id}>
                <Td className="font-heading">
                  <Link href={`${base}/clients/${x.id}`} className="hover:text-accent">{x.name ?? x.email}</Link>
                </Td>
                <Td>
                  <span dir="ltr">{x.email}</span>
                </Td>
                <Td>{money(x.lifetimeValueMinor, "USD", locale)}</Td>
                <Td className="text-muted">{dateTime(x.lastSeenAt, locale)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
