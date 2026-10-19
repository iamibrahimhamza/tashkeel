import { dirOf, getDictionary } from "@tashkeel/i18n";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Kufam, Readex_Pro } from "next/font/google";
import type { ReactNode } from "react";
import { getLocale } from "@/lib/locale";
import "./globals.css";

const kufam = Kufam({ subsets: ["arabic", "latin"], weight: ["500", "600", "700"], variable: "--font-kufam", display: "swap" });
const readex = Readex_Pro({ subsets: ["arabic", "latin"], weight: ["400", "500", "600"], variable: "--font-readex", display: "swap" });
const plex = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale());
  return {
    metadataBase: new URL(process.env.WEB_URL ?? "http://localhost:3000"),
    title: { default: t.meta.title, template: "%s · تشكيل" },
    description: t.meta.description,
    openGraph: { siteName: "Tashkeel · تشكيل", type: "website", locale: "ar_AR", alternateLocale: ["en_US"] },
  };
}

export const viewport: Viewport = { themeColor: "#19221E", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${kufam.variable} ${readex.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
