import { getDictionary, type Dictionary } from "@tashkeel/i18n";
import { ButtonLink, Container, cx, Logo, LogoMark, SectionHeading } from "@tashkeel/ui";
import { getLocale } from "@/lib/locale";
import { WaitlistForm } from "./waitlist-form";

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
        <ComingSoon t={t} />
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
          <a href="/login" className="px-3 font-heading text-[0.95rem]">{t.nav.login}</a>
          <ButtonLink href="#waitlist" className="hidden px-5 py-2.5 sm:inline-flex">{t.nav.join}</ButtonLink>
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
          <a href="#pillars" className="mt-8 inline-flex items-center gap-2 font-heading text-sm text-accent underline-offset-4 hover:underline">
            {t.hero.secondary}
          </a>
        </div>

        <div id="waitlist" className="relative mx-auto w-full max-w-md scroll-mt-24">
          <div className="absolute -inset-5 -z-10 rounded-[28px] bg-sand" />
          <div className="rounded-[22px] border border-line bg-paper p-7 shadow-[0_30px_80px_-40px_rgba(25,34,30,.45)]">
            <h2 className="font-display text-2xl">{t.waitlist.title}</h2>
            <p className="mb-6 mt-2 text-sm leading-7 text-muted">{t.waitlist.body}</p>
            <WaitlistForm t={t.waitlist} />
          </div>
        </div>
      </Container>
      <div className="rule" />
    </section>
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

/** What is not live yet, labelled plainly so the page never promises more than Beta v1 does. */
function ComingSoon({ t }: { t: Dictionary }) {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading index={t.soon.index} eyebrow={t.soon.eyebrow} title={t.soon.title} lead={t.soon.lead} />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.soon.items.map((s) => (
            <article key={s.k} className="rounded-[18px] border border-dashed border-line p-6">
              <span className="inline-block rounded-full bg-sand px-3 py-1 font-heading text-xs text-accent">{t.soon.badge}</span>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-7 text-muted">{s.body}</p>
            </article>
          ))}
        </div>
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
                <a href="#waitlist" className={cx("mt-8 rounded-full py-3 text-center font-heading font-medium transition", featured ? "bg-gold text-forest hover:brightness-105" : "border border-ink/20 hover:border-ink/50")}>
                  {t.pricing.cta}
                </a>
              </article>
            );
          })}
        </div>
        <p className="mt-6 text-center text-sm text-muted">{t.pricing.note}</p>
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
        <ButtonLink href="#waitlist" className="mt-9 px-9">{t.cta.button}</ButtonLink>
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
