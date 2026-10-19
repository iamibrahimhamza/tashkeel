import { PublicHome, SiteEditorState } from "@tashkeel/contracts";
import { api } from "@/lib/api";
import { workspaceContext } from "../context";
import { Builder } from "./builder";

export const dynamic = "force-dynamic";

export default async function HomeBuilderPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { token, workspace, locale } = await workspaceContext(workspaceId);
  // The editor state and the live catalogue (services, products, posts) the sections draw from.
  const [state, published] = await Promise.all([
    api<unknown>(`/v1/workspaces/${workspace.id}/site`, { token }).then((d) => SiteEditorState.parse(d)),
    api<unknown>(`/v1/public/homes/${workspace.slug}`, { token }).then((d) => PublicHome.parse(d)),
  ]);
  const catalog = {
    services: published.services.map((s) => ({ id: s.id, title: s.title })),
    products: published.products.map((p) => ({ id: p.id, title: p.title, type: p.type })),
  };
  return <Builder initial={state} catalog={catalog} previewData={{ services: published.services, products: published.products, posts: published.posts }} locale={locale} />;
}
