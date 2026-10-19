import { PageHeader, Panel } from "@/components/dash";
import { BalanceCards } from "./balance-cards";
import { workspaceContext } from "./context";
import { dashboardData } from "./data";
import { OrdersTable } from "./orders-table";

export default async function Overview({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { token, workspace, t, locale, base } = await workspaceContext(workspaceId);
  const data = dashboardData(token, workspace.id);
  const [balances, orders] = await Promise.all([data.balances(), data.orders(5)]);
  return (
    <>
      <PageHeader title={t.dash.overview.title} lead={workspace.name} />
      <BalanceCards balances={balances} currency="USD" t={t} locale={locale} />
      <Panel
        className="mt-8"
        title={t.dash.overview.recentSales}
        action={orders.data.length ? <a href={`${base}/sales`} className="font-heading text-sm text-accent">{t.dash.overview.seeAll}</a> : undefined}
      >
        <OrdersTable orders={orders.data} t={t} locale={locale} />
      </Panel>
    </>
  );
}
