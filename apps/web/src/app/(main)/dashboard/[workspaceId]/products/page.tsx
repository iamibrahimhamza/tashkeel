import Link from "next/link";
import { EmptyState, money, PageHeader, Panel, StatusBadge, Table, Td } from "@/components/dash";
import { workspaceContext } from "../context";
import { dashboardData } from "../data";

export default async function Products({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { token, workspace, t, locale, base } = await workspaceContext(workspaceId);
  const products = await dashboardData(token, workspace.id).products();
  const c = t.dash.table;
  const ar = locale === "ar";
  const add = (
    <Link href={`${base}/products/new`} className="rounded-full bg-ink px-5 py-2.5 font-heading text-sm text-paper">
      + {t.dash.product.add}
    </Link>
  );
  return (
    <>
      <PageHeader title={t.dash.nav.products} action={products.length > 0 ? add : undefined} />
      <Panel>
        {products.length === 0 ? (
          <EmptyState icon="products" title={t.dash.empty.products.title} body={t.dash.empty.products.body}>
            {add}
          </EmptyState>
        ) : (
          <Table head={[c.item, c.type, c.price, c.status]}>
            {products.map((p) => (
              <tr key={p.id}>
                <Td className="font-heading">
                  <Link href={`${base}/products/${p.id}`} className="hover:text-accent">{p.title}</Link>
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
