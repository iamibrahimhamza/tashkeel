import { cx } from "@tashkeel/ui";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { money, PageHeader } from "@/components/dash";
import { api } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { workspaceContext } from "../context";
import { dashboardData } from "../data";

export const dynamic = "force-dynamic";

async function upgrade(workspaceId: string, planCode: "PRO" | "BUSINESS", idempotencyKey: string) {
  "use server";
  const { token } = await requireSession();
  const { checkoutUrl } = await api<{ checkoutUrl: string }>(`/v1/workspaces/${workspaceId}/billing/checkout`, { token, method: "POST", idempotencyKey, body: { planCode } });
  redirect(checkoutUrl);
}

export default async function Billing({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { token, workspace, t, locale } = await workspaceContext(workspaceId);
  const canManage = workspace.role === "OWNER";
  const b = t.dash.billing;
  const billing = canManage ? await dashboardData(token, workspace.id).billing() : null;
  const pct = (bps: number) => `${(bps / 100).toLocaleString("en", { maximumFractionDigits: 2 })}%`;

  return (
    <>
      <PageHeader title={b.title} />
      {billing && (
        <div className="grid gap-6 lg:grid-cols-3">
          {billing.plans.map((p) => {
            const current = p.code === billing.planCode;
            return (
              <article key={p.code} className={cx("flex flex-col rounded-[18px] p-7", current ? "bg-forest text-[#FAF8F6]" : "border border-line")}>
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-lg">{locale === "ar" ? p.nameAr : p.name}</h2>
                  {current && <span className="rounded-full bg-gold px-3 py-1 font-heading text-xs text-forest">{b.currentBadge}</span>}
                </div>
                <p className="mt-5 font-display text-4xl">{money(p.monthlyMinor, p.currency, locale)}</p>
                <p className={cx("mt-2 font-heading text-sm", current ? "text-gold-light" : "text-accent")}>
                  {pct(p.feeBps)} {b.fee}
                </p>
                {!current && p.code !== "FREE" && (
                  <form action={upgrade.bind(null, workspace.id, p.code as "PRO" | "BUSINESS", randomUUID())} className="mt-8">
                    <button className="w-full rounded-full bg-ink py-3 font-heading text-sm text-paper hover:opacity-90">{b.upgrade}</button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
