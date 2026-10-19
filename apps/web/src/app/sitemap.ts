import type { MetadataRoute } from "next";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const revalidate = 3600;

/** Marketing pages plus every published expert home. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [{ url: `${WEB}/`, changeFrequency: "weekly", priority: 1 }];
  try {
    const res = await fetch(`${API}/v1/public/homes`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const { data } = (await res.json()) as { data: Array<{ slug: string; updatedAt: string }> };
      for (const h of data) entries.push({ url: `${WEB}/${h.slug}`, lastModified: h.updatedAt, changeFrequency: "weekly", priority: 0.8 });
    }
  } catch {
    // API unreachable at build time: serve the marketing entries; the next revalidation adds homes.
  }
  return entries;
}
