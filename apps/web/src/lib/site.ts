/**
 * The platform's public domain, from NEXT_PUBLIC_ROOT_DOMAIN (inlined at build time, so it is
 * safe in client components too). Expert homes are clean paths on it: `<domain>/<slug>`.
 */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "tashkeel.online";

/** Display form of an expert's link, e.g. "tashkeel.online/ibrahim". */
export const homeLink = (slug: string) => `${ROOT_DOMAIN}/${slug}`;
