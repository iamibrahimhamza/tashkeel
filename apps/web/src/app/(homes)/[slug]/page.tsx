import { Slug } from "@tashkeel/contracts";
import { currencyExponent } from "@tashkeel/core/money";
import { Container, LogoMark } from "@tashkeel/ui";
import { HomePage } from "@tashkeel/ui/blocks";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPublicHome } from "@/lib/api";

type Props = { params: Promise<{ slug: string }> };

// ISR: each home is rendered on first visit, cached, and refreshed when the expert publishes
// (the publish action calls revalidateTag("home:<slug>")). The time-based fallback catches
// changes made elsewhere, such as a newly published product.
export const revalidate = 300;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

async function load(raw: string) {
  const parsed = Slug.safeParse(decodeURIComponent(raw).toLowerCase());
  if (!parsed.success) return null;
  return fetchPublicHome(parsed.data);
}

function firstText(home: NonNullable<Awaited<ReturnType<typeof load>>>): string | undefined {
  for (const b of home.blocks) {
    if (b.hidden) continue;
    if (b.type === "hero" && b.props.subtitle) return b.props.subtitle;
    if (b.type === "bio") return b.props.bodyMd.replace(/[#*>\-]/g, "").slice(0, 160).trim();
  }
  return undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const home = await load((await params).slug);
  if (!home) return { title: "تشكيل" };
  const url = `/${home.workspace.slug}`;
  const description = home.seo.description ?? firstText(home);
  return {
    title: { absolute: home.seo.title },
    description,
    alternates: { canonical: url },
    openGraph: { title: home.seo.title, description, url, type: "profile", siteName: "Tashkeel · تشكيل", locale: "ar_AR" },
    twitter: { card: "summary_large_image", title: home.seo.title, description },
    robots: { index: true, follow: true },
  };
}

export default async function ExpertHome({ params }: Props) {
  const home = await load((await params).slug);
  if (!home) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: home.workspace.name,
    description: home.seo.description ?? firstText(home),
    url: `/${home.workspace.slug}`,
    ...(home.services.length
      ? {
          makesOffer: home.services.map((s) => ({
            "@type": "Offer",
            name: s.title,
            priceCurrency: s.currency,
            price: (Number(s.priceMinor) / 10 ** currencyExponent(s.currency)).toFixed(currencyExponent(s.currency)),
          })),
        }
      : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <HomePage home={home} basePath={`/${home.workspace.slug}`} locale="ar" />
      <footer className="border-t border-line py-8" style={{ background: home.theme.colors.paper, color: home.theme.colors.ink }}>
        <Container className="flex items-center justify-between text-sm" style={{ color: home.theme.colors.muted }}>
          <span>© {home.workspace.name}</span>
          <a href="/" className="inline-flex items-center gap-2 hover:opacity-80">
            <LogoMark size={16} />
            صُنع بـ تشكيل
          </a>
        </Container>
      </footer>
    </>
  );
}
