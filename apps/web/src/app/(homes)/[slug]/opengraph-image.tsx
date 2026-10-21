import { ImageResponse } from "next/og";
import { homeLink } from "@/lib/site";

export const alt = "Tashkeel · تشكيل";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social card for an expert home: the Tashkeel mark and the home's link, on the brand palette.
 * Text is Latin only because the OG renderer cannot shape Arabic; the Arabic title and
 * description travel in the og:title / og:description tags instead.
 */
export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cell = (bg: string, round = false) => <div style={{ width: 120, height: 120, borderRadius: round ? 60 : 24, background: bg }} />;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#19221E", gap: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", gap: 24 }}>
            {cell("#A98B4C")}
            {cell("#FAF8F6")}
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            {cell("#FAF8F6")}
            {cell("#A98B4C", true)}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 56, color: "#D4B87B", letterSpacing: 1 }}>{homeLink(decodeURIComponent(slug))}</div>
      </div>
    ),
    size,
  );
}
