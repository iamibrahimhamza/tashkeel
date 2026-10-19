import { formatMoney, intlLocale } from "@tashkeel/core";
import type { Dictionary } from "@tashkeel/i18n";
import { cx, Logo } from "@tashkeel/ui";
import type { ReactNode } from "react";
import { logout } from "@/app/(main)/(auth)/actions";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; active?: boolean };

const ICONS = {
  overview: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z",
  home: "M4 11 12 4l8 7v9h-5v-6H9v6H4z",
  services: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5h4",
  sales: "M4 19V9M10 19V5M16 19v-7M22 19H2",
  clients: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  bookings: "M5 6h14v13H5zM5 10h14M9 3v4M15 3v4",
  products: "M7 3h7l4 4v14H7zM14 3v4h4",
  payouts: "M3 7h18v10H3zM3 11h18M7 15h3",
  billing: "M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
} as const;

export function Icon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("size-5 shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Shell({ nav, title, subtitle, footerLinks, t, children }: { nav: NavItem[]; title: string; subtitle?: string; footerLinks?: NavItem[]; t: Dictionary; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="border-b border-line bg-sand lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-e">
        <div className="flex items-center justify-between px-5 py-5 lg:block">
          <a href="/" aria-label="تشكيل">
            <Logo />
          </a>
          <div className="lg:mt-6">
            <p className="font-heading text-sm">{title}</p>
            {subtitle && <p className="text-xs text-muted" dir="ltr">{subtitle}</p>}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {nav.map((n) => (
            <a key={n.href} href={n.href} aria-current={n.active ? "page" : undefined} className={cx("flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 font-heading text-sm transition", n.active ? "bg-paper text-ink shadow-[0_1px_0_var(--line)]" : "text-muted hover:bg-paper/60 hover:text-ink")}>
              <Icon name={n.icon} className={n.active ? "text-accent" : undefined} />
              {n.label}
            </a>
          ))}
        </nav>
        <div className="hidden border-t border-line px-3 py-4 lg:block">
          {footerLinks?.map((n) => (
            <a key={n.href} href={n.href} className="flex items-center gap-3 rounded-xl px-3 py-2 font-heading text-sm text-muted hover:text-ink">
              <Icon name={n.icon} />
              {n.label}
            </a>
          ))}
          <form action={logout}>
            <button className="mt-1 w-full rounded-xl px-3 py-2 text-start font-heading text-sm text-muted hover:text-ink">{t.auth.logout}</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">{children}</main>
    </div>
  );
}

export function PageHeader({ title, lead, action }: { title: string; lead?: string; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl">{title}</h1>
        {lead && <p className="mt-2 text-muted">{lead}</p>}
      </div>
      {action}
    </header>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-[18px] border border-line bg-paper", className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-heading text-base font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, tone = "paper" }: { label: string; value: string; hint?: string; tone?: "paper" | "forest" }) {
  return (
    <div className={cx("rounded-[18px] p-6", tone === "forest" ? "bg-forest text-[#FAF8F6]" : "border border-line bg-paper")}>
      <p className={cx("font-heading text-sm", tone === "forest" ? "text-gold-light" : "text-muted")}>{label}</p>
      <p className="mt-3 font-display text-3xl" dir="ltr" style={{ textAlign: "end" }}>{value}</p>
      {hint && <p className={cx("mt-2 text-xs", tone === "forest" ? "text-[#FAF8F6]/60" : "text-muted")}>{hint}</p>}
    </div>
  );
}

/** An intentional zero state: what will appear here and how it gets there. Never fake rows. */
export function EmptyState({ icon, title, body, children }: { icon: keyof typeof ICONS; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="relative mb-6 grid size-16 place-items-center">
        <span className="absolute inset-0 rounded-2xl border border-accent/30" />
        <span className="absolute inset-2 rounded-xl bg-sand" />
        <Icon name={icon} className="relative size-6 text-accent" />
      </div>
      <h3 className="font-heading text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-7 text-muted">{body}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

const TONE: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-800",
  CONFIRMED: "bg-emerald-50 text-emerald-800",
  COMPLETED: "bg-emerald-50 text-emerald-800",
  PUBLISHED: "bg-emerald-50 text-emerald-800",
  PENDING: "bg-amber-50 text-amber-800",
  REQUESTED: "bg-amber-50 text-amber-800",
  APPROVED: "bg-sky-50 text-sky-800",
  PROCESSING: "bg-sky-50 text-sky-800",
  PENDING_PAYMENT: "bg-amber-50 text-amber-800",
};

export function StatusBadge({ status, t }: { status: string; t: Dictionary }) {
  const label = (t.dash.status as Record<string, string>)[status] ?? status;
  return <span className={cx("inline-block rounded-full px-2.5 py-1 font-heading text-xs", TONE[status] ?? "bg-ink/5 text-muted")}>{label}</span>;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-line text-start text-xs text-muted">
            {head.map((h) => (
              <th key={h} className="px-6 py-3 text-start font-heading font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className }: { children: ReactNode; className?: string }) => <td className={cx("px-6 py-4 align-middle", className)}>{children}</td>;

export function money(minor: string, currency: string, locale: "ar" | "en") {
  return formatMoney(BigInt(minor), currency, { locale });
}

export function dateTime(iso: string, locale: "ar" | "en", withTime = false) {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(iso));
}
