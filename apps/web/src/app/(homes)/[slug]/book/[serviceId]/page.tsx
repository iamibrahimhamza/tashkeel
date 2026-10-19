import { PublicServicePage } from "@tashkeel/contracts";
import { formatMoney } from "@tashkeel/core/money";
import { Container, Markdown, themeStyle } from "@tashkeel/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { ApiRequestError, fetchPublicHome } from "@/lib/api";
import { BookingWidget } from "./booking-widget";

type Props = { params: Promise<{ slug: string; serviceId: string }> };

// Each visit mints the form's idempotency key; availability itself is fetched live by the widget.
export const dynamic = "force-dynamic";

const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function load(slug: string, serviceId: string) {
  const res = await fetch(`${API}/v1/public/homes/${encodeURIComponent(slug)}/services/${encodeURIComponent(serviceId)}`, { next: { revalidate: 60, tags: [`home:${slug}`] } });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiRequestError(res.status, null);
  return PublicServicePage.parse(await res.json());
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, serviceId } = await params;
  const page = await load(slug, serviceId);
  if (!page) return {};
  return {
    title: { absolute: `${page.service.title} — ${page.workspace.name}` },
    description: page.service.description ?? undefined,
    alternates: { canonical: `/${page.workspace.slug}/book/${page.service.id}` },
    openGraph: { title: page.service.title, description: page.service.description ?? undefined, type: "website" },
  };
}

const LOCATION = { VIDEO: "مكالمة فيديو", IN_PERSON: "حضورياً", PHONE: "مكالمة هاتفية" } as const;

export default async function BookPage({ params }: Props) {
  const { slug, serviceId } = await params;
  const [page, home] = await Promise.all([load(slug, serviceId), fetchPublicHome(slug)]);
  if (!page || !home) notFound();
  const s = page.service;
  const price = s.priceMinor === "0" ? "مجاناً" : formatMoney(BigInt(s.priceMinor), s.currency, { locale: "ar" });

  return (
    <div style={themeStyle(home.theme)} className="min-h-dvh">
      <Container className="py-6">
        <a href={`/${page.workspace.slug}`} className="font-heading text-sm text-muted hover:text-ink">→ {page.workspace.name}</a>
      </Container>
      <Container className="grid gap-10 pb-24 pt-4 lg:grid-cols-[1fr_1.6fr]">
        <aside>
          <p className="eyebrow">{page.workspace.name}</p>
          <h1 className="mt-3 font-display text-3xl leading-snug sm:text-4xl">{s.title}</h1>
          <ul className="mt-6 grid gap-2 text-sm">
            <li className="flex gap-2"><span className="text-muted">المدة</span><span className="font-heading">{s.durationMin} دقيقة</span></li>
            <li className="flex gap-2"><span className="text-muted">الطريقة</span><span className="font-heading">{LOCATION[s.locationType]}</span></li>
            <li className="flex gap-2"><span className="text-muted">السعر</span><span className="font-heading">{price}</span></li>
          </ul>
          {s.description && <Markdown source={s.description} className="prose-editorial mt-6 text-muted" />}
        </aside>
        <BookingWidget page={page} idempotencyKey={randomUUID()} />
      </Container>
    </div>
  );
}
