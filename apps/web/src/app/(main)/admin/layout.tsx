import { getDictionary } from "@tashkeel/i18n";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Shell, type NavItem } from "@/components/dash";
import { getLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Tashkeel staff area. Hidden (404) from everyone else. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { me } = await requireSession("/admin");
  if (me.platformRole === "USER") notFound();
  const t = getDictionary(await getLocale());
  const path = (await headers()).get("x-pathname") ?? "";
  const a = t.dash.admin;
  const nav: NavItem[] = [
    { href: "/admin", label: a.payouts, icon: "payouts", active: path === "/admin" || path.startsWith("/admin/payouts") },
    ...(me.platformRole === "SUPERADMIN" ? [{ href: "/admin/settings/payments", label: a.settings, icon: "settings" as const, active: path.startsWith("/admin/settings") }] : []),
  ];
  const footer: NavItem[] = me.workspaces[0] ? [{ href: `/dashboard/${me.workspaces[0].id}`, label: t.dash.nav.overview, icon: "overview" }] : [];
  return (
    <Shell nav={nav} title={a.title} subtitle={me.email} footerLinks={footer} t={t}>
      {children}
    </Shell>
  );
}
