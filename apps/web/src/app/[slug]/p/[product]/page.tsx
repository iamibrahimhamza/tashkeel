import { formatMoney, intlLocale } from "@tashkeel/core";
import { Container, Markdown, themeStyle } from "@tashkeel/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { fetchPublicProduct } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { BuyForm } from "./buy-form";

type Props = { params: Promise<{ slug: string; product: string }> };

// Each render mints a fresh idempotency key for the form, so this page is never cached.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, product } = await params;
  const page = await fetchPublicProduct(slug, decodeURIComponent(product));
  if (!page) return {};
  return {
    title: { absolute: `${page.product.title} — ${page.workspace.name}` },
    description: page.product.description ?? undefined,
    openGraph: { title: page.product.title, description: page.product.description ?? undefined, type: "website" },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug, product } = await params;
  const page = await fetchPublicProduct(slug, decodeURIComponent(product));
  if (!page) notFound();
  const locale = await getLocale();
  const ar = locale === "ar";
  const p = page.product;
  const price = p.priceMinor === "0" ? (ar ? "مجاناً" : "Free") : formatMoney(BigInt(p.priceMinor), p.currency, { locale });
  const lessons = p.modules.reduce((n, m) => n + m.lessons.length, 0);
  const num = new Intl.NumberFormat(intlLocale(locale));

  return (
    <div style={themeStyle(page.theme)} className="min-h-dvh">
      <Container className="py-6">
        <a href={`/${page.workspace.slug}`} className="font-heading text-sm text-muted hover:text-ink">
          {ar ? "→ " : "← "}
          {page.workspace.name}
        </a>
      </Container>
      <Container className="grid gap-12 pb-24 pt-6 lg:grid-cols-[1.4fr_1fr]">
        <article>
          <p className="eyebrow">{p.type === "COURSE" ? (ar ? "دورة" : "Course") : ar ? "منتج رقمي" : "Digital product"}</p>
          <h1 className="mt-3 font-display text-4xl leading-snug sm:text-5xl">{p.title}</h1>
          {p.description && <Markdown source={p.description} className="prose-editorial mt-6 text-muted" />}

          {p.modules.length > 0 && (
            <section className="mt-12">
              <h2 className="text-xl font-semibold">
                {ar ? "محتوى الدورة" : "Curriculum"} · <span className="text-muted">{num.format(lessons)} {ar ? "دروس" : "lessons"}</span>
              </h2>
              <ol className="mt-5 divide-y divide-line border-y border-line">
                {p.modules.map((m, i) => (
                  <li key={m.title} className="py-5">
                    <p className="font-heading">
                      <span className="text-accent">{num.format(i + 1)}.</span> {m.title}
                    </p>
                    <ul className="mt-3 grid gap-2 ps-6 text-[0.95rem] text-muted">
                      {m.lessons.map((l) => (
                        <li key={l.title} className="flex items-center justify-between gap-4">
                          <span>{l.title}</span>
                          <span className="shrink-0 text-xs">
                            {l.isPreview ? <span className="rounded-full bg-sand px-2 py-0.5 text-accent">{ar ? "معاينة مجانية" : "Free preview"}</span> : l.durationSec ? `${num.format(Math.round(l.durationSec / 60))} ${ar ? "د" : "min"}` : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </article>

        <aside className="h-fit rounded-[var(--radius)] border border-line bg-sand p-7 lg:sticky lg:top-8">
          <p className="font-display text-4xl">{price}</p>
          <p className="mt-2 text-sm text-muted">{ar ? "دفعة واحدة · وصول فوري بعد الدفع" : "One-time payment · instant access"}</p>
          <div className="rule my-6" />
          <BuyForm
            slug={page.workspace.slug}
            productId={p.id}
            idempotencyKey={randomUUID()}
            labels={{
              name: ar ? "الاسم (اختياري)" : "Name (optional)",
              email: ar ? "البريد الإلكتروني" : "Email",
              submit: ar ? "إتمام الشراء" : "Buy now",
              pending: ar ? "جارٍ التحويل إلى الدفع…" : "Redirecting to checkout…",
              secure: ar ? "دفع آمن عبر تشكيل باي · Stripe" : "Secure payment by Tashkeel Pay · Stripe",
            }}
          />
        </aside>
      </Container>
    </div>
  );
}
