import { AvailabilityDto } from "@tashkeel/contracts";
import { PageHeader } from "@/components/dash";
import { api } from "@/lib/api";
import { workspaceContext } from "../context";
import { AvailabilityEditor } from "./availability-editor";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { token, workspace, t, locale } = await workspaceContext(workspaceId);
  const initial = AvailabilityDto.parse(await api<unknown>(`/v1/workspaces/${workspace.id}/availability`, { token }));
  return (
    <>
      <PageHeader title={t.dash.nav.availability} lead={locale === "ar" ? "متى يمكن لعملائك حجز جلساتك." : "When clients can book your sessions."} />
      <AvailabilityEditor initial={initial} workspaceId={workspace.id} slug={workspace.slug} locale={locale} />
    </>
  );
}
