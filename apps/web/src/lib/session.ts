import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiRequestError } from "./api";

export const SESSION_COOKIE = "tk_session";

export type Me = {
  id: string;
  email: string;
  name: string | null;
  platformRole: "USER" | "STAFF" | "SUPERADMIN";
  workspaces: Array<{ id: string; slug: string; name: string; role: "OWNER" | "ADMIN" | "EDITOR" | "SUPPORT" }>;
};

/** The API access token lives only in an httpOnly cookie; the browser's JS never sees it. */
export async function setSession(token: string, maxAgeSec: number) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/** Current user, or a redirect to /login when signed out or the token has expired. */
export async function requireSession(next?: string): Promise<{ token: string; me: Me }> {
  const token = await getToken();
  const login = `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  if (!token) redirect(login);
  try {
    return { token, me: await api<Me>("/v1/auth/me", { token }) };
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 401) redirect(login);
    throw e;
  }
}
