"use server";

import { redirect } from "next/navigation";
import { apiPublic } from "@/lib/api";
import { getToken } from "@/lib/session";

/** Approve or decline a sandbox checkout; the API answers with where the browser goes next. */
export async function decide(sessionId: string, kind: "payment" | "subscription", decision: "approve" | "decline") {
  const path = kind === "payment" ? `/v1/sandbox/sessions/${encodeURIComponent(sessionId)}/decision` : `/v1/sandbox/subscriptions/${encodeURIComponent(sessionId)}/decision`;
  const token = kind === "subscription" ? await getToken() : null;
  if (kind === "subscription" && !token) redirect(`/login?next=${encodeURIComponent(`/pay/sandbox/${sessionId}`)}`);
  const { redirectUrl } = await apiPublic<{ redirectUrl: string }>(path, { decision }, token ?? undefined);
  redirect(redirectUrl);
}
