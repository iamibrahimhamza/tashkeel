import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Shell, type NavItem } from "@/components/dash";
import { workspaceContext } from "./context";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children, params }: { children: ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { me, workspace, t, base } = await workspaceContext(workspaceId);
  const path = (await headers()).get("x-pathname") ?? "";
  const n = t.dash.nav;
  const items: Array<Omit<NavItem, "active">> = [
    { href: base, label: n.overview, icon: "overview" },
    { href: `${base}/sales`, label: n.sales, icon: "sales" },
    { href: `${base}/clients`, label: n.clients, icon: "clients" },
    { href: `${base}/bookings`, label: n.bookings, icon: "bookings" },
    { href: `${base}/products`, label: n.products, icon: "products" },
    { href: `${base}/payouts`, label: n.payouts, icon: "payouts" },
    { href: `${base}/billing`, label: n.billing, icon: "billing" },
  ];
  const nav = items.map((i) => ({ ...i, active: i.href === base ? path === base : path.startsWith(i.href) }));
  const footer: NavItem[] = [
    { href: `/${workspace.slug}`, label: n.viewPage, icon: "external" },
    ...(me.platformRole !== "USER" ? [{ href: "/admin", label: n.admin, icon: "settings" as const }] : []),
  ];
  return (
    <Shell nav={nav} title={workspace.name} subtitle={`tashkeel.app/${workspace.slug}`} footerLinks={footer} t={t}>
      {children}
    </Shell>
  );
}
