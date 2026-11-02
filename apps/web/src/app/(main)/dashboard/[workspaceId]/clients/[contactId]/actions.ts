"use server";

import { getDictionary } from "@tashkeel/i18n";
import { revalidatePath } from "next/cache";
import { api, errorMessage } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";

export type NoteFormState = { ok?: boolean; error?: string; at?: number };

const path = (workspaceId: string, contactId: string) => `/v1/workspaces/${workspaceId}/contacts/${encodeURIComponent(contactId)}/notes`;

export async function addNote(workspaceId: string, contactId: string, _prev: NoteFormState, form: FormData): Promise<NoteFormState> {
  const { token } = await requireSession();
  const locale = await getLocale();
  try {
    await api(path(workspaceId, contactId), { token, method: "POST", body: { body: String(form.get("body") ?? "") } });
  } catch (e) {
    return { error: errorMessage(e, locale, getDictionary(locale).auth.failed) };
  }
  revalidatePath(`/dashboard/${workspaceId}/clients/${contactId}`);
  // `at` changes on every save so the form can clear itself.
  return { ok: true, at: Date.now() };
}

export async function deleteNote(workspaceId: string, contactId: string, noteId: string): Promise<void> {
  const { token } = await requireSession();
  await api(`${path(workspaceId, contactId)}/${encodeURIComponent(noteId)}`, { token, method: "DELETE" });
  revalidatePath(`/dashboard/${workspaceId}/clients/${contactId}`);
}
