/** Minor-unit exponent per ISO-4217 currency (USD=2, JPY=0, KWD=3 …), via Intl. */
export function currencyExponent(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Integer division rounding half away from zero. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (2n * d);
  return negative ? -q : q;
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/**
 * BCP-47 tag for Intl formatting. Tashkeel always writes numbers with Western digits
 * (0-9), including in Arabic, so the numbering system is pinned to "latn".
 */
export function intlLocale(locale: "ar" | "en"): string {
  return `${locale}-u-nu-latn`;
}

export interface FormatMoneyOptions {
  locale?: "ar" | "en";
}

/** Formats minor units for display, e.g. 15000n USD → "150 $" (ar) / "$150" (en). Always Western digits. */
export function formatMoney(amountMinor: bigint, currency: string, opts: FormatMoneyOptions = {}): string {
  const exp = currencyExponent(currency);
  const base = 10n ** BigInt(exp);
  const isWhole = amountMinor % base === 0n;
  const fmt = new Intl.NumberFormat(intlLocale(opts.locale ?? "ar"), { style: "currency", currency, minimumFractionDigits: isWhole ? 0 : exp });
  // Arabic CLDR writes "US$", which right-to-left text renders as "$US". Use the short
  // symbol ("$", "€") everywhere. Display only: Number is exact below 2^53 minor units.
  return fmt
    .formatToParts(Number(amountMinor) / Number(base))
    .map((p) => (p.type === "currency" ? narrowSymbol(currency) : p.value))
    .join("");
}

function narrowSymbol(currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
}

/** Parses a decimal major-unit string ("49.99") into minor units for the given currency. */
export function parseMajor(value: string, currency: string): bigint {
  const exp = currencyExponent(currency);
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) throw new RangeError(`invalid amount: ${value}`);
  const frac = (m[2] ?? "").padEnd(exp, "0");
  if (frac.length > exp) throw new RangeError(`too many decimals for ${currency}`);
  return BigInt(m[1]!) * 10n ** BigInt(exp) + BigInt(frac || "0");
}
