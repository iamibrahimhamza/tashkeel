import "server-only";
import { getDictionary } from "@tashkeel/i18n";
import { notFound } from "next/navigation";
import { getLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";

/** Session + the workspace from the URL, which must be one the user belongs to. */
export async function workspaceContext(workspaceId: string) {
  const { token, me } = await requireSession(`/dashboard/${workspaceId}`);
  const workspace = me.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) notFound();
  const locale = await getLocale();
  return { token, me, workspace, locale, t: getDictionary(locale), base: `/dashboard/${workspaceId}` };
}
