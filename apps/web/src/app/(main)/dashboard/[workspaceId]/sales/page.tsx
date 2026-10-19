import { PageHeader, Panel } from "@/components/dash";
import { workspaceContext } from "../context";
import { dashboardData } from "../data";
import { OrdersTable } from "../orders-table";

export default async function Sales({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { token, workspace, t, locale } = await workspaceContext(workspaceId);
  const orders = await dashboardData(token, workspace.id).orders(100);
  return (
    <>
      <PageHeader title={t.dash.nav.sales} />
      <Panel>
        <OrdersTable orders={orders.data} t={t} locale={locale} />
      </Panel>
    </>
  );
}
