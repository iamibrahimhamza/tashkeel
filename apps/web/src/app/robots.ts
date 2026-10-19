import type { MetadataRoute } from "next";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/pay", "/login", "/signup", "/*/checkout"] }],
    sitemap: `${WEB}/sitemap.xml`,
  };
}
