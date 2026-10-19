import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@tashkeel/i18n";
import { cookies } from "next/headers";

/** Arabic by default; an explicit cookie switches the UI to English (LTR). */
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}
