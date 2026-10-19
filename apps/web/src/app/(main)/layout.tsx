import { dirOf, getDictionary } from "@tashkeel/i18n";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@/lib/fonts";
import { getLocale } from "@/lib/locale";
import "../globals.css";


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
    <html lang={locale} dir={dirOf(locale)} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
