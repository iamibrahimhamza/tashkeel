"use server";

import type { PageBlocks, PageVersionSummary } from "@tashkeel/contracts";
import { revalidatePath, revalidateTag } from "next/cache";
import { api, errorMessage } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: (token: string) => Promise<T>): Promise<ActionResult<T>> {
  const { token } = await requireSession();
  const locale = await getLocale();
  try {
    return { ok: true, data: await fn(token) };
  } catch (e) {
    return { ok: false, error: errorMessage(e, locale, locale === "ar" ? "تعذّر الحفظ، حاول مرة أخرى" : "Could not save, please try again") };
  }
}

/** The public page is served from the ISR cache; publishing invalidates exactly that page. */
function refreshPublic(slug: string) {
  revalidateTag(`home:${slug}`);
  revalidatePath(`/${slug}`);
}

const home = (w: string) => `/v1/workspaces/${w}/pages/home`;

export async function saveDraft(workspaceId: string, blocks: PageBlocks) {
  return run((token) => api<{ versionId: string; unchanged: boolean }>(`${home(workspaceId)}/draft`, { token, method: "PUT", body: { blocks } }));
}

/** Save the current blocks as a version (if changed) and point the public page at it. */
export async function publish(workspaceId: string, blocks: PageBlocks) {
  return run(async (token) => {
    const saved = await api<{ versionId: string }>(`${home(workspaceId)}/draft`, { token, method: "PUT", body: { blocks } });
    const res = await api<{ publishedVersionId: string; slug: string }>(`${home(workspaceId)}/publish`, { token, method: "POST", body: { versionId: saved.versionId } });
    refreshPublic(res.slug);
    return res;
  });
}

/** Roll the public page back (or forward) to an earlier immutable version. */
export async function publishVersion(workspaceId: string, versionId: string) {
  return run(async (token) => {
    const res = await api<{ publishedVersionId: string; slug: string }>(`${home(workspaceId)}/publish`, { token, method: "POST", body: { versionId } });
    refreshPublic(res.slug);
    return res;
  });
}

export async function listVersions(workspaceId: string) {
  return run((token) => api<{ data: PageVersionSummary[] }>(`${home(workspaceId)}/versions`, { token }).then((r) => r.data));
}

export async function loadVersion(workspaceId: string, versionId: string) {
  return run((token) => api<{ blocks: PageBlocks }>(`${home(workspaceId)}/versions/${versionId}`, { token }).then((r) => r.blocks));
}

/** Theme and SEO apply to the live page immediately. */
export async function updateSite(workspaceId: string, slug: string, input: { themeId?: string; seo?: { title?: string; description?: string } }) {
  return run(async (token) => {
    await api(`/v1/workspaces/${workspaceId}/site`, { token, method: "PATCH", body: input });
    refreshPublic(slug);
    return null;
  });
}
