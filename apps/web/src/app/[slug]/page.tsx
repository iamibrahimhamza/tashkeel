import { Slug } from "@tashkeel/contracts";
import { currencyExponent } from "@tashkeel/core";
import { getDictionary } from "@tashkeel/i18n";
import { Container, LogoMark } from "@tashkeel/ui";
import { HomePage } from "@tashkeel/ui/blocks";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPublicHome } from "@/lib/api";
import { getLocale } from "@/lib/locale";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 60;

async function load(raw: string) {
  const parsed = Slug.safeParse(decodeURIComponent(raw).toLowerCase());
  if (!parsed.success) return null;
  return fetchPublicHome(parsed.data);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const home = await load((await params).slug);
  if (!home) return {};
  const url = `/${home.workspace.slug}`;
  return {
    title: { absolute: home.seo.title },
    description: home.seo.description,
    alternates: { canonical: url },
    openGraph: { title: home.seo.title, description: home.seo.description, url, type: "profile" },
    twitter: { card: "summary_large_image", title: home.seo.title, description: home.seo.description },
  };
}

export default async function ExpertHome({ params }: Props) {
  const home = await load((await params).slug);
  if (!home) notFound();
  const locale = await getLocale();
  const t = getDictionary(locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: home.workspace.name,
    description: home.seo.description,
    url: `/${home.workspace.slug}`,
    makesOffer: home.services.map((s) => ({ "@type": "Offer", name: s.title, priceCurrency: s.currency, price: (Number(s.priceMinor) / 10 ** currencyExponent(s.currency)).toFixed(currencyExponent(s.currency)) })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <HomePage home={home} basePath={`/${home.workspace.slug}`} locale={locale} />
      <footer className="border-t border-line py-8" style={{ background: home.theme.colors.paper, color: home.theme.colors.ink }}>
        <Container className="flex items-center justify-between text-sm" style={{ color: home.theme.colors.muted }}>
          <span>© {home.workspace.name}</span>
          <a href="/" className="inline-flex items-center gap-2 hover:opacity-80">
            <LogoMark size={16} />
            {t.home.poweredBy}
          </a>
        </Container>
      </footer>
    </>
  );
}
