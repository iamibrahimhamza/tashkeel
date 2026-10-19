import { getDictionary, type Dictionary } from "@tashkeel/i18n";
import { ButtonLink, Container, cx, Logo, LogoMark, SectionHeading } from "@tashkeel/ui";
import type { ReactNode } from "react";
import { getLocale } from "@/lib/locale";

export default async function LandingPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return (
    <>
      <SiteHeader t={t} />
      <main>
        <Hero t={t} />
        <Problem t={t} />
        <Pillars t={t} />
        <Pay t={t} />
        <Steps t={t} />
        <Pricing t={t} />
        <FinalCta t={t} />
      </main>
      <SiteFooter t={t} />
    </>
  );
}

function SiteHeader({ t }: { t: Dictionary }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-6">
        <a href="/" aria-label="تشكيل">
          <Logo />
        </a>
        <nav className="hidden items-center gap-8 font-heading text-[0.95rem] text-muted md:flex">
          <a href="#pillars" className="hover:text-ink">{t.nav.features}</a>
          <a href="#pay" className="hover:text-ink">{t.nav.pay}</a>
          <a href="#pricing" className="hover:text-ink">{t.nav.pricing}</a>
        </nav>
        <div className="flex items-center gap-2">
          <a href="/login" className="hidden px-3 font-heading text-[0.95rem] sm:inline">{t.nav.login}</a>
          <ButtonLink href="/signup" className="px-5 py-2.5">{t.nav.start}</ButtonLink>
        </div>
      </Container>
    </header>
  );
}

function Hero({ t }: { t: Dictionary }) {
  return (
    <section className="relative overflow-hidden">
      <Container className="grid items-center gap-14 pb-20 pt-16 lg:grid-cols-[1.15fr_1fr] lg:pb-28 lg:pt-24">
        <div>
          <p className="eyebrow mb-6 flex items-center gap-3">
            <span className="h-px w-10 bg-accent" />
            {t.hero.eyebrow}
          </p>
          <h1 className="font-display text-[2.4rem] leading-[1.4] sm:text-[3.4rem] sm:leading-[1.35]">{t.hero.title}</h1>
          <p className="mt-7 max-w-xl text-lg leading-9 text-muted">{t.hero.lead}</p>

          <form action="/signup" className="mt-10 flex max-w-lg flex-col gap-3 sm:flex-row" dir="ltr">
            <label className="flex min-w-0 flex-1 items-center rounded-full border border-ink/15 bg-white/70 ps-5 focus-within:border-accent">
              <span className="select-none text-muted">{t.hero.slugPrefix}</span>
              <input
                name="slug"
                aria-label={t.hero.slugPlaceholder}
                placeholder={t.hero.slugPlaceholder}
                pattern="[a-z0-9-]{3,40}"
                className="min-w-0 flex-1 bg-transparent py-3.5 pe-4 text-ink outline-none placeholder:text-muted/60"
              />
            </label>
            <button className="rounded-full bg-ink px-7 py-3.5 font-heading font-medium text-paper transition hover:opacity-90">{t.hero.primary}</button>
          </form>
          <a href="#pillars" className="mt-5 inline-flex items-center gap-2 font-heading text-sm text-accent underline-offset-4 hover:underline">
            {t.hero.secondary}
          </a>
        </div>

        <HeroAnatomy t={t} />
      </Container>
      <div className="rule" />
    </section>
  );
}

/**
 * The anatomy of a digital home: which pillar each part of the page is. Purely structural —
 * no names, prices or figures, because Tashkeel never shows invented data.
 */
function HeroAnatomy({ t }: { t: Dictionary }) {
  const [home, consult, assets, blog] = t.pillars.items;
  const line = (w: string) => <span className={cx("block h-2 rounded-full bg-ink/10", w)} />;
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="absolute -inset-6 -z-10 rounded-[28px] bg-sand" />
      <div className="overflow-hidden rounded-[22px] border border-line bg-paper shadow-[0_30px_80px_-40px_rgba(25,34,30,.45)]">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3 text-xs text-muted" dir="ltr">
          <span className="size-2 rounded-full bg-ink/15" />
          <span className="size-2 rounded-full bg-ink/15" />
          <span className="size-2 rounded-full bg-ink/15" />
          <span className="ms-3 rounded-full bg-sand px-3 py-1">
            {t.hero.slugPrefix}
            <span className="text-accent">{t.hero.slugPlaceholder}</span>
          </span>
        </div>
        <div className="grid gap-3 p-6">
          <AnatomyPart label={home!.title} tone="ink">
            <span className="block h-3 w-2/3 rounded-full bg-paper/30" />
            <span className="mt-2 block h-2 w-5/6 rounded-full bg-paper/15" />
          </AnatomyPart>
          <div className="grid grid-cols-2 gap-3">
            <AnatomyPart label={consult!.title}>{line("w-4/5")}{line("mt-2 w-3/5")}</AnatomyPart>
            <AnatomyPart label={assets!.title}>{line("w-3/4")}{line("mt-2 w-1/2")}</AnatomyPart>
          </div>
          <AnatomyPart label={blog!.title}>{line("w-full")}{line("mt-2 w-4/5")}{line("mt-2 w-2/3")}</AnatomyPart>
          <div className="flex items-center justify-between rounded-xl bg-forest px-4 py-3">
            <span className="font-heading text-xs text-gold-light">{t.pay.eyebrow}</span>
            <LogoMark size={18} tone="paper" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AnatomyPart({ label, tone = "paper", children }: { label: string; tone?: "paper" | "ink"; children: ReactNode }) {
  return (
    <div className={cx("rounded-xl p-4", tone === "ink" ? "bg-ink text-paper" : "border border-line")}>
      <p className={cx("mb-3 font-heading text-xs", tone === "ink" ? "text-gold-light" : "text-accent")}>{label}</p>
      {children}
    </div>
  );
}

function Problem({ t }: { t: Dictionary }) {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading index={t.problem.index} eyebrow={t.problem.eyebrow} title={t.problem.title} />
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {t.problem.points.map((p, i) => (
            <div key={p.title} className="border-t border-ink/80 pt-6">
              <p className="font-display text-sm text-accent">{["أ", "ب", "ج"][i]}</p>
              <h3 className="mt-3 text-xl font-semibold">{p.title}</h3>
              <p className="mt-3 leading-8 text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

const PILLAR_ICONS: Record<string, string> = {
  home: "M4 11 12 4l8 7v9H4z",
  consult: "M5 6h14v13H5zM5 10h14M9 3v4M15 3v4",
  assets: "M7 3h7l4 4v14H7zM14 3v4h4",
  blog: "M5 19h14M7 15 16 6l2 2-9 9H7z",
  crm: "M4 20V10M10 20V4M16 20v-7M22 20H2",
};

/** Editorial rows: one pillar per row, what it is and what it concretely does. */
function Pillars({ t }: { t: Dictionary }) {
  return (
    <section id="pillars" className="scroll-mt-20 bg-sand py-20 sm:py-28">
      <Container>
        <SectionHeading index={t.pillars.index} eyebrow={t.pillars.eyebrow} title={t.pillars.title} />
        <ol className="mt-14 border-t border-ink/80">
          {t.pillars.items.map((p, i) => (
            <li key={p.k} className="grid gap-6 border-b border-line py-10 md:grid-cols-[4rem_1fr_1fr] md:gap-10">
              <span className="font-display text-3xl text-accent/80">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
                    <path d={PILLAR_ICONS[p.k]} />
                  </svg>
                  <h3 className="text-2xl font-semibold">{p.title}</h3>
                </div>
                <p className="mt-4 text-lg leading-9 text-muted">{p.body}</p>
              </div>
              <ul className="space-y-3 self-center">
                {p.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-3">
                    <span className="mt-3 size-1.5 shrink-0 rounded-full bg-accent" />
                    {pt}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function Pay({ t }: { t: Dictionary }) {
  return (
    <section id="pay" className="bg-forest py-20 text-[#FAF8F6] sm:py-28" style={{ ["--ink" as string]: "#FAF8F6", ["--muted" as string]: "#A9ADA6", ["--accent" as string]: "#D4B87B" }}>
      <Container className="grid gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading index={t.pay.index} eyebrow={t.pay.eyebrow} title={t.pay.title} lead={t.pay.lead} />
          <ul className="mt-10 flex flex-wrap gap-2.5">
            {t.pay.rails.map((r) => (
              <li key={r} className="rounded-full border border-[#D4B87B]/40 px-4 py-2 font-heading text-sm text-[#D4B87B]">{r}</li>
            ))}
          </ul>
        </div>
        <ol className="space-y-0 self-end">
          {t.pay.points.map((p, i) => (
            <li key={p} className="flex gap-6 border-t border-[#FAF8F6]/15 py-6">
              <span className="font-display text-2xl text-[#D4B87B]">{["1", "2", "3"][i]}</span>
              <p className="text-lg leading-8 text-[#FAF8F6]/85">{p}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function Steps({ t }: { t: Dictionary }) {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading index={t.steps.index} eyebrow={t.steps.eyebrow} title={t.steps.title} />
        <ol className="mt-14 grid gap-10 md:grid-cols-3">
          {t.steps.items.map((s, i) => (
            <li key={s.title}>
              <span className="font-display text-5xl text-accent/70">{["1", "2", "3"][i]}</span>
              <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 leading-8 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function Pricing({ t }: { t: Dictionary }) {
  return (
    <section id="pricing" className="bg-sand py-20 sm:py-28">
      <Container>
        <SectionHeading index={t.pricing.index} eyebrow={t.pricing.eyebrow} title={t.pricing.title} />
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {t.pricing.plans.map((p) => {
            const featured = p.code === "PRO";
            return (
              <article key={p.code} className={cx("relative flex flex-col rounded-[18px] p-8", featured ? "bg-forest text-[#FAF8F6]" : "border border-line bg-paper")}>
                {featured && <span className="absolute -top-3 start-8 rounded-full bg-gold px-3 py-1 font-heading text-xs text-forest">{t.pricing.popular}</span>}
                <h3 className="font-heading text-lg">{p.name}</h3>
                <p className="mt-5 flex items-baseline gap-2">
                  <span className="font-display text-5xl" dir="ltr">${p.price}</span>
                  <span className={featured ? "text-[#FAF8F6]/60" : "text-muted"}>{t.pricing.perMonth}</span>
                </p>
                <p className={cx("mt-2 font-heading text-sm", featured ? "text-gold-light" : "text-accent")}>
                  {p.fee} {t.pricing.fee}
                </p>
                <ul className={cx("mt-8 flex-1 space-y-3 border-t pt-6", featured ? "border-[#FAF8F6]/15" : "border-line")}>
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <span className={cx("mt-2.5 size-1.5 shrink-0 rounded-full", featured ? "bg-gold-light" : "bg-accent")} />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href={`/signup?plan=${p.code}`} className={cx("mt-8 rounded-full py-3 text-center font-heading font-medium transition", featured ? "bg-gold text-forest hover:brightness-105" : "border border-ink/20 hover:border-ink/50")}>
                  {t.pricing.cta}
                </a>
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

function FinalCta({ t }: { t: Dictionary }) {
  return (
    <section className="py-24 sm:py-32">
      <Container className="text-center">
        <LogoMark size={44} className="mx-auto" />
        <h2 className="mx-auto mt-8 max-w-2xl font-display text-4xl leading-snug sm:text-5xl">{t.cta.title}</h2>
        <p className="mt-4 text-muted">{t.cta.body}</p>
        <ButtonLink href="/signup" className="mt-9 px-9">{t.cta.button}</ButtonLink>
      </Container>
    </section>
  );
}

function SiteFooter({ t }: { t: Dictionary }) {
  return (
    <footer className="border-t border-line py-10">
      <Container className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-muted">{t.footer.tagline}</p>
        </div>
        <p className="text-sm text-muted">© {new Date().getFullYear()} Tashkeel · تشكيل — {t.footer.rights}</p>
      </Container>
    </footer>
  );
}
