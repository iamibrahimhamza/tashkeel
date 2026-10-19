import type { Block, PublicHome } from "@tashkeel/contracts";
import { formatMoney, intlLocale } from "@tashkeel/core";
import type { CSSProperties, ReactNode } from "react";
import { Markdown } from "../markdown";
import { ButtonLink, Container, cx, themeStyle } from "../primitives";

type Ctx = {
  home: PublicHome;
  /** Builds links inside the expert's home, e.g. `/sara/book/svc_1`. */
  href: (path: string) => string;
  locale: "ar" | "en";
};

const displayFont: CSSProperties = { fontFamily: "var(--font-display-choice, var(--font-kufam))" };

function money(ctx: Ctx, minor: string, currency: string) {
  if (minor === "0") return ctx.locale === "ar" ? "مجاناً" : "Free";
  return formatMoney(BigInt(minor), currency, { locale: ctx.locale });
}

function digits(ctx: Ctx, n: number) {
  return new Intl.NumberFormat(intlLocale(ctx.locale)).format(n);
}

function Section({ id, children, tone = "paper", className }: { id?: string; children: ReactNode; tone?: "paper" | "sand"; className?: string }) {
  return (
    <section id={id} className={cx("py-16 sm:py-24", tone === "sand" && "bg-sand", className)}>
      <Container>{children}</Container>
    </section>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <div className="mb-10 flex items-center gap-4">
      <h2 className="text-2xl font-semibold sm:text-3xl">{children}</h2>
      <span className="rule flex-1" />
    </div>
  );
}

// ── Individual blocks ────────────────────────────────

function Hero({ b, ctx }: { b: Extract<Block, { type: "hero" }>; ctx: Ctx }) {
  const { eyebrow, title, subtitle, cta, layout } = b.props;
  const initials = ctx.home.workspace.name.replace(/^د\.\s*/, "").trim().charAt(0);
  const centered = layout === "centered";
  return (
    <section className="relative overflow-hidden pb-16 pt-14 sm:pb-24 sm:pt-20">
      <Container className={cx("grid items-center gap-12", !centered && "lg:grid-cols-[1.35fr_1fr]")}>
        <div className={cx(centered && "mx-auto max-w-3xl text-center")}>
          {eyebrow && <p className="eyebrow mb-5">{eyebrow}</p>}
          <h1 className="text-4xl font-semibold leading-[1.3] sm:text-5xl lg:text-[3.4rem]" style={displayFont}>
            {title}
          </h1>
          {subtitle && <p className="mt-6 max-w-2xl text-lg leading-9 text-muted" style={centered ? { marginInline: "auto" } : undefined}>{subtitle}</p>}
          {cta && (
            <div className={cx("mt-9 flex flex-wrap gap-3", centered && "justify-center")}>
              <ButtonLink href={cta.href}>{cta.label}</ButtonLink>
            </div>
          )}
        </div>
        {!centered && (
          <div className="relative mx-auto aspect-[4/5] w-full max-w-sm">
            <div className="absolute inset-0 translate-x-4 translate-y-4 rounded-[var(--radius)] border border-accent/50" />
            <div className="relative flex h-full w-full items-end justify-start overflow-hidden rounded-[var(--radius)] bg-sand p-7">
              <span className="absolute inset-0 flex select-none items-center justify-center pb-10 text-[10rem] leading-none text-accent/30" style={displayFont} aria-hidden="true">
                {initials}
              </span>
              <div>
                <p className="text-sm text-muted">{ctx.home.workspace.name}</p>
                <p className="mt-1 h-px w-16 bg-accent" />
              </div>
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}

function Bio({ b }: { b: Extract<Block, { type: "bio" }> }) {
  return (
    <Section tone="sand">
      <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
        <h2 className="text-2xl font-semibold sm:text-3xl">{b.props.heading}</h2>
        <div>
          <Markdown source={b.props.bodyMd} className="prose-editorial" />
          {b.props.credentials.length > 0 && (
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {b.props.credentials.map((c) => (
                <li key={c} className="flex items-start gap-3 border-t border-line pt-3 text-[0.95rem]">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

function Services({ b, ctx }: { b: Extract<Block, { type: "services" }>; ctx: Ctx }) {
  const ids = b.props.serviceIds;
  const list = ids ? ctx.home.services.filter((s) => ids.includes(s.id)) : ctx.home.services;
  if (!list.length) return null;
  return (
    <Section id="services">
      <Heading>{b.props.heading}</Heading>
      <div className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line md:grid-cols-3">
        {list.map((s) => (
          <article key={s.id} className="flex flex-col bg-paper p-7">
            <p className="eyebrow">
              {digits(ctx, s.durationMin)} {ctx.locale === "ar" ? "دقيقة" : "min"}
            </p>
            <h3 className="mt-3 text-xl font-semibold">{s.title}</h3>
            {s.description && <p className="mt-3 flex-1 text-[0.95rem] leading-8 text-muted">{s.description}</p>}
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-5">
              <span className="font-heading text-lg">{money(ctx, s.priceMinor, s.currency)}</span>
              <a href={ctx.href(`/book/${s.id}`)} className="font-heading text-sm text-accent underline-offset-4 hover:underline">
                {ctx.locale === "ar" ? "احجز موعداً ←" : "Book →"}
              </a>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

function Products({ b, ctx }: { b: Extract<Block, { type: "products" }>; ctx: Ctx }) {
  let list = ctx.home.products;
  if (b.props.kind === "files") list = list.filter((p) => p.type === "FILE");
  if (b.props.kind === "courses") list = list.filter((p) => p.type === "COURSE");
  if (b.props.productIds) list = list.filter((p) => b.props.productIds!.includes(p.id));
  if (!list.length) return null;
  return (
    <Section tone="sand">
      <Heading>{b.props.heading}</Heading>
      <div className="grid gap-6 md:grid-cols-2">
        {list.map((p) => (
          <a key={p.id} href={ctx.href(`/p/${p.slug}`)} className="group grid grid-cols-[96px_1fr] gap-6 rounded-[var(--radius)] bg-paper p-6 transition hover:shadow-[0_10px_40px_-20px_rgba(25,34,30,.35)] sm:grid-cols-[120px_1fr]">
            <div className="flex aspect-[3/4] items-center justify-center rounded-[calc(var(--radius)/2)] bg-ink text-paper">
              <span className="text-xs tracking-wide text-accent-soft">{p.type === "COURSE" ? (ctx.locale === "ar" ? "دورة" : "Course") : ctx.locale === "ar" ? "دليل" : "Guide"}</span>
            </div>
            <div className="flex flex-col">
              <h3 className="text-lg font-semibold group-hover:text-accent">{p.title}</h3>
              {p.description && <p className="mt-2 line-clamp-3 flex-1 text-[0.95rem] leading-7 text-muted">{p.description}</p>}
              <p className="mt-4 font-heading">{money(ctx, p.priceMinor, p.currency)}</p>
            </div>
          </a>
        ))}
      </div>
    </Section>
  );
}

function Posts({ b, ctx }: { b: Extract<Block, { type: "posts" }>; ctx: Ctx }) {
  const list = ctx.home.posts.slice(0, b.props.limit);
  if (!list.length) return null;
  const date = new Intl.DateTimeFormat(intlLocale(ctx.locale), { day: "numeric", month: "long", year: "numeric" });
  return (
    <Section>
      <Heading>{b.props.heading}</Heading>
      <div className="divide-y divide-line border-y border-line">
        {list.map((p) => (
          <a key={p.slug} href={ctx.href(`/blog/${p.slug}`)} className="group grid gap-2 py-7 sm:grid-cols-[180px_1fr] sm:gap-10">
            <p className="text-sm text-muted">
              {date.format(new Date(p.publishedAt))} · {digits(ctx, p.readingMin)} {ctx.locale === "ar" ? "دقائق قراءة" : "min read"}
            </p>
            <div>
              <h3 className="text-xl font-semibold transition group-hover:text-accent">{p.title}</h3>
              {p.excerpt && <p className="mt-2 text-muted">{p.excerpt}</p>}
            </div>
          </a>
        ))}
      </div>
    </Section>
  );
}

function Testimonials({ b }: { b: Extract<Block, { type: "testimonials" }> }) {
  if (!b.props.items.length) return null;
  return (
    <Section tone="sand">
      <Heading>{b.props.heading}</Heading>
      <div className="grid gap-10 md:grid-cols-2">
        {b.props.items.map((t, i) => (
          <figure key={i} className="relative ps-8">
            <span className="absolute -top-4 start-0 font-display text-6xl leading-none text-accent">”</span>
            <blockquote className="text-xl leading-10">{t.quote}</blockquote>
            <figcaption className="mt-5 text-sm text-muted">
              <span className="font-heading text-ink">{t.name}</span>
              {t.role && <> — {t.role}</>}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

function Newsletter({ b, ctx }: { b: Extract<Block, { type: "newsletter" }>; ctx: Ctx }) {
  return (
    <section className="bg-forest py-16 text-[#FAF8F6] sm:py-20">
      <Container className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-semibold" style={displayFont}>{b.props.heading}</h2>
          {b.props.body && <p className="mt-3 text-[#FAF8F6]/70">{b.props.body}</p>}
        </div>
        <form action={ctx.href("/subscribe")} method="post" className="flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="nl-email">{ctx.locale === "ar" ? "البريد الإلكتروني" : "Email"}</label>
          <input id="nl-email" name="email" type="email" required dir="ltr" placeholder="you@example.com" className="min-w-0 flex-1 rounded-full border border-[#FAF8F6]/25 bg-transparent px-5 py-3 text-end placeholder:text-[#FAF8F6]/40 focus:border-gold-light focus:outline-none" />
          <button type="submit" className="rounded-full bg-gold px-7 py-3 font-heading font-medium text-forest">{b.props.buttonLabel}</button>
        </form>
      </Container>
    </section>
  );
}

function Links({ b }: { b: Extract<Block, { type: "links" }> }) {
  return (
    <Section>
      {b.props.heading && <Heading>{b.props.heading}</Heading>}
      <ul className="mx-auto grid max-w-xl gap-3">
        {b.props.items.map((l) => (
          <li key={l.href}>
            <a href={l.href} rel="noopener noreferrer" target="_blank" className="flex items-center justify-between rounded-full border border-line px-6 py-4 transition hover:border-accent">
              <span className="font-heading">{l.label}</span>
              <span className="text-accent">↖</span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Faq({ b }: { b: Extract<Block, { type: "faq" }> }) {
  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
        <h2 className="text-2xl font-semibold sm:text-3xl">{b.props.heading}</h2>
        <div className="divide-y divide-line border-y border-line">
          {b.props.items.map((f, i) => (
            <details key={i} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-lg">
                {f.q}
                <span className="text-accent transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-8 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

function RichText({ b }: { b: Extract<Block, { type: "richText" }> }) {
  return (
    <Section>
      <Markdown source={b.props.bodyMd} className={cx("prose-editorial", b.props.width === "narrow" && "mx-auto max-w-2xl")} />
    </Section>
  );
}

export function BlockView({ block, ctx }: { block: Block; ctx: Ctx }) {
  if (block.hidden) return null;
  switch (block.type) {
    case "hero": return <Hero b={block} ctx={ctx} />;
    case "bio": return <Bio b={block} />;
    case "services": return <Services b={block} ctx={ctx} />;
    case "products": return <Products b={block} ctx={ctx} />;
    case "posts": return <Posts b={block} ctx={ctx} />;
    case "testimonials": return <Testimonials b={block} />;
    case "newsletter": return <Newsletter b={block} ctx={ctx} />;
    case "links": return <Links b={block} />;
    case "faq": return <Faq b={block} />;
    case "richText": return <RichText b={block} />;
  }
}

/** Renders a published digital home, themed by its tokens. */
export function HomePage({ home, basePath, locale = "ar" }: { home: PublicHome; basePath: string; locale?: "ar" | "en" }) {
  const ctx: Ctx = { home, locale, href: (p) => `${basePath}${p}` };
  return (
    <div style={themeStyle(home.theme)} className="min-h-dvh">
      {home.blocks.map((b) => (
        <BlockView key={b.id} block={b} ctx={ctx} />
      ))}
    </div>
  );
}
