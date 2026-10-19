import { EmptyState, money, PageHeader, Panel, StatusBadge, Table, Td } from "@/components/dash";
import { workspaceContext } from "../context";
import { dashboardData } from "../data";

export default async function Products({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { token, workspace, t, locale } = await workspaceContext(workspaceId);
  const products = await dashboardData(token, workspace.id).products();
  const c = t.dash.table;
  const ar = locale === "ar";
  return (
    <>
      <PageHeader title={t.dash.nav.products} />
      <Panel>
        {products.length === 0 ? (
          <EmptyState icon="products" title={t.dash.empty.products.title} body={t.dash.empty.products.body} />
        ) : (
          <Table head={[c.item, c.type, c.price, c.status]}>
            {products.map((p) => (
              <tr key={p.id}>
                <Td className="font-heading">
                  <a href={`/${workspace.slug}/p/${p.slug}`} className="hover:text-accent">{p.title}</a>
                </Td>
                <Td className="text-muted">{p.type === "COURSE" ? (ar ? "دورة" : "Course") : ar ? "ملف رقمي" : "Digital file"}</Td>
                <Td>{money(p.priceMinor, p.currency, locale)}</Td>
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
