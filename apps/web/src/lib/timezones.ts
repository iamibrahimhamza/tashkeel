/** Timezones offered in pickers: the Arab world first, then where diaspora clients live. */
export const TIMEZONES: Array<{ id: string; ar: string; en: string }> = [
  { id: "Asia/Riyadh", ar: "الرياض", en: "Riyadh" },
  { id: "Asia/Damascus", ar: "دمشق", en: "Damascus" },
  { id: "Asia/Beirut", ar: "بيروت", en: "Beirut" },
  { id: "Asia/Baghdad", ar: "بغداد", en: "Baghdad" },
  { id: "Asia/Amman", ar: "عمّان", en: "Amman" },
  { id: "Asia/Hebron", ar: "فلسطين", en: "Palestine" },
  { id: "Africa/Cairo", ar: "القاهرة", en: "Cairo" },
  { id: "Asia/Dubai", ar: "دبي", en: "Dubai" },
  { id: "Asia/Kuwait", ar: "الكويت", en: "Kuwait" },
  { id: "Asia/Qatar", ar: "الدوحة", en: "Doha" },
  { id: "Asia/Bahrain", ar: "المنامة", en: "Manama" },
  { id: "Asia/Muscat", ar: "مسقط", en: "Muscat" },
  { id: "Asia/Aden", ar: "عدن", en: "Aden" },
  { id: "Africa/Khartoum", ar: "الخرطوم", en: "Khartoum" },
  { id: "Africa/Tripoli", ar: "طرابلس", en: "Tripoli" },
  { id: "Africa/Tunis", ar: "تونس", en: "Tunis" },
  { id: "Africa/Algiers", ar: "الجزائر", en: "Algiers" },
  { id: "Africa/Casablanca", ar: "الدار البيضاء", en: "Casablanca" },
  { id: "Europe/Istanbul", ar: "إسطنبول", en: "Istanbul" },
  { id: "Europe/London", ar: "لندن", en: "London" },
  { id: "Europe/Berlin", ar: "برلين", en: "Berlin" },
  { id: "Europe/Paris", ar: "باريس", en: "Paris" },
  { id: "Europe/Stockholm", ar: "ستوكهولم", en: "Stockholm" },
  { id: "America/New_York", ar: "نيويورك", en: "New York" },
  { id: "America/Toronto", ar: "تورونتو", en: "Toronto" },
  { id: "America/Chicago", ar: "شيكاغو", en: "Chicago" },
  { id: "America/Los_Angeles", ar: "لوس أنجلوس", en: "Los Angeles" },
  { id: "Australia/Sydney", ar: "سيدني", en: "Sydney" },
  { id: "UTC", ar: "التوقيت العالمي", en: "UTC" },
];

/** Label for any IANA zone, including ones not in the curated list (e.g. a detected zone). */
export function tzLabel(id: string, locale: "ar" | "en"): string {
  const known = TIMEZONES.find((z) => z.id === id);
  return known ? known[locale] : id.split("/").pop()!.replace(/_/g, " ");
}

/** Current UTC offset of a zone, e.g. "GMT+3". */
export function tzOffset(id: string): string {
  try {
    return new Intl.DateTimeFormat("en", { timeZone: id, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}
