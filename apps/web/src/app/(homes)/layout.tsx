import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@/lib/fonts";
import "../globals.css";

/**
 * Root layout for public expert homes. Deliberately reads no cookies or headers, so homes can
 * be statically generated and revalidated on publish (ISR). Homes are Arabic-first RTL.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.WEB_URL ?? "http://localhost:3000"),
  openGraph: { siteName: "Tashkeel · تشكيل", locale: "ar_AR" },
};

export const viewport: Viewport = { themeColor: "#19221E", width: "device-width", initialScale: 1 };

export default function HomesLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
