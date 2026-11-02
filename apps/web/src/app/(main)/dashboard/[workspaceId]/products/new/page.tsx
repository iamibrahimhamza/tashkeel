import Link from "next/link";
import { PageHeader, Panel } from "@/components/dash";
import { workspaceContext } from "../../context";
import { createProduct } from "../actions";
import { ProductForm } from "../editor";

export default async function NewProduct({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { workspace, t, locale, base } = await workspaceContext(workspaceId);
  const p = t.dash.product;
  return (
    <>
      <Link href={`${base}/products`} className="mb-4 inline-block font-heading text-sm text-muted hover:text-ink">{locale === "ar" ? "→" : "←"} {p.back}</Link>
      <PageHeader title={p.add} />
      <Panel className="p-6">
        <ProductForm action={createProduct.bind(null, workspace.id, workspace.slug)} t={p} submit={p.create} />
      </Panel>
    </>
  );
}
