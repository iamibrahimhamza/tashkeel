"use server";

import type { DownloadLink } from "@tashkeel/contracts";
import { getDictionary } from "@tashkeel/i18n";
import { apiPublic, errorMessage } from "@/lib/api";
import { getLocale } from "@/lib/locale";

export type ResendState = { sent?: boolean; error?: string };

/** Spends one of the link's downloads and returns a storage URL that lives for five minutes. */
export async function startDownload(token: string, fileId: string): Promise<{ url: string } | { error: string }> {
  const locale = await getLocale();
  try {
    const link = await apiPublic<DownloadLink>(`/v1/public/downloads/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}`, {});
    return { url: link.url };
  } catch (e) {
    return { error: errorMessage(e, locale, getDictionary(locale).auth.failed) };
  }
}

export async function resendLinks(_prev: ResendState, form: FormData): Promise<ResendState> {
  const locale = await getLocale();
  try {
    await apiPublic("/v1/public/downloads/resend", { email: String(form.get("email") ?? "") });
    return { sent: true };
  } catch (e) {
    return { error: errorMessage(e, locale, getDictionary(locale).auth.failed) };
  }
}
