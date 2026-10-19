import type { ServiceDto } from "@tashkeel/contracts";
import { PageHeader } from "@/components/dash";
import { api } from "@/lib/api";
import { workspaceContext } from "../context";
import { ServicesEditor } from "./services-editor";

export const dynamic = "force-dynamic";

export default async function ServicesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { token, workspace, t, locale, base } = await workspaceContext(workspaceId);
  const { data } = await api<{ data: ServiceDto[] }>(`/v1/workspaces/${workspace.id}/services`, { token });
  const ar = locale === "ar";
  return (
    <>
      <PageHeader
        title={t.dash.nav.services}
        lead={ar ? "جلساتك الاستشارية الفردية، تُحجز وتُدفع من صفحتك مباشرة." : "Your 1-on-1 sessions, booked and paid for right from your page."}
        action={<a href={`${base}/availability`} className="font-heading text-sm text-accent">{t.dash.nav.availability} ←</a>}
      />
      <ServicesEditor services={data} workspaceId={workspace.id} slug={workspace.slug} locale={locale} />
    </>
  );
}
