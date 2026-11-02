import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Panel, StatusBadge } from "@/components/dash";
import { ApiRequestError } from "@/lib/api";
import { workspaceContext } from "../../context";
import { dashboardData } from "../../data";
import { updateProduct } from "../actions";
import { CoverPanel, FilesPanel, ProductForm, StatusPanel } from "../editor";

export default async function EditProduct({ params }: { params: Promise<{ workspaceId: string; productId: string }> }) {
  const { workspaceId, productId } = await params;
  const { token, workspace, t, locale, base } = await workspaceContext(workspaceId);
  const product = await dashboardData(token, workspace.id)
    .product(productId)
    .catch((e: unknown) => {
      if (e instanceof ApiRequestError && e.status === 404) notFound();
      throw e;
    });
  const p = t.dash.product;
  const ctx = { product, workspaceId: workspace.id, slug: workspace.slug, t: p };

  return (
    <>
      <Link href={`${base}/products`} className="mb-4 inline-block font-heading text-sm text-muted hover:text-ink">{locale === "ar" ? "→" : "←"} {p.back}</Link>
      <PageHeader title={product.title} action={<StatusBadge status={product.status} t={t} />} />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="grid gap-6">
          <Panel title={p.files}>
            <div className="px-6 py-5">
              <FilesPanel {...ctx} />
            </div>
          </Panel>
          <Panel className="p-6">
            <ProductForm action={updateProduct.bind(null, workspace.id, workspace.slug, product.id)} t={p} initial={product} submit={p.save} />
          </Panel>
        </div>
        <div className="grid gap-6">
          <Panel title={p.status}>
            <div className="px-6 py-5">
              <StatusPanel {...ctx} publicUrl={`/${workspace.slug}/p/${product.slug}`} />
            </div>
          </Panel>
          <Panel title={p.cover}>
            <div className="px-6 py-5">
              <CoverPanel {...ctx} />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
