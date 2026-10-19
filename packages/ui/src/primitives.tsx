import type { ThemeTokens } from "@tashkeel/contracts";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** The Tashkeel mark: a 2×2 grid — gold square, two solid squares, gold circle. */
export function LogoMark({ size = 32, className, tone = "ink" }: { size?: number; className?: string; tone?: "ink" | "paper" }) {
  const solid = tone === "ink" ? "var(--ink)" : "var(--paper)";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="4" y="4" width="25" height="25" rx="5" fill="var(--accent)" />
      <rect x="35" y="4" width="25" height="25" rx="5" fill={solid} />
      <rect x="4" y="35" width="25" height="25" rx="5" fill={solid} />
      <circle cx="47.5" cy="47.5" r="12.5" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ tone = "ink", className }: { tone?: "ink" | "paper"; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={30} tone={tone} />
      <span className="font-display text-[1.6rem] leading-none" style={{ color: tone === "ink" ? "var(--ink)" : "var(--paper)" }}>
        تشكيل
      </span>
    </span>
  );
}

export function Container({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)} {...rest} />;
}

type Variant = "primary" | "secondary" | "ghost" | "gold";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:opacity-90",
  gold: "bg-accent text-forest hover:brightness-105",
  secondary: "border border-ink/20 text-ink hover:border-ink/50 bg-transparent",
  ghost: "text-ink hover:bg-ink/5",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.95rem] font-medium font-heading transition disabled:opacity-50 disabled:pointer-events-none";

export function Button({ variant = "primary", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cx(base, variants[variant], className)} {...rest} />;
}

export function ButtonLink({ variant = "primary", className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant }) {
  return <a className={cx(base, variants[variant], className)} {...rest} />;
}

export function SectionHeading({ index, eyebrow, title, lead, align = "start" }: { index?: string; eyebrow?: string; title: ReactNode; lead?: ReactNode; align?: "start" | "center" }) {
  return (
    <header className={cx("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {(index || eyebrow) && (
        <p className="eyebrow mb-4 flex items-center gap-3" style={align === "center" ? { justifyContent: "center" } : undefined}>
          {index && <span className="font-display text-base">{index}</span>}
          {index && eyebrow && <span className="h-px w-8 bg-accent/60" />}
          {eyebrow}
        </p>
      )}
      <h2 className="text-3xl font-semibold sm:text-4xl">{title}</h2>
      {lead && <p className="mt-4 text-lg text-muted">{lead}</p>}
    </header>
  );
}

/** Maps theme tokens to the CSS variables the design system reads. */
export function themeStyle(t: ThemeTokens): CSSProperties {
  const radius = { none: "2px", soft: "14px", round: "24px" }[t.radius];
  const font = { kufam: "var(--font-kufam)", readex: "var(--font-readex)", plex: "var(--font-plex)" };
  return {
    "--ink": t.colors.ink,
    "--paper": t.colors.paper,
    "--sand": t.colors.sand,
    "--accent": t.colors.accent,
    "--accent-soft": t.colors.accentSoft,
    "--muted": t.colors.muted,
    "--radius": radius,
    "--font-display-choice": font[t.fonts.display],
    colorScheme: t.mode,
    background: t.colors.paper,
    color: t.colors.ink,
  } as CSSProperties;
}
