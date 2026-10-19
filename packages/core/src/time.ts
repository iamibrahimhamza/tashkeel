/**
 * Minimal, dependency-free timezone math on top of Intl.
 * Local dates are "YYYY-MM-DD", local times "HH:mm"; instants are JS Dates (UTC).
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function dtf(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

export interface LocalParts {
  date: string;
  time: string;
  weekday: number;
}

/** Wall-clock parts of an instant in a timezone. */
export function toLocal(instant: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(dtf(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, time: `${parts.hour}:${parts.minute}`, weekday: weekdayOf(date) };
}

/** Offset (ms) of `timeZone` from UTC at a given instant. */
export function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = Object.fromEntries(dtf(timeZone).formatToParts(instant).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Converts a wall-clock time in `timeZone` to an instant.
 * Returns null for times that do not exist (skipped by a DST jump).
 * Ambiguous times (DST fall-back) resolve to the earlier instant.
 */
export function fromLocal(date: string, time: string, timeZone: string): Date | null {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const candidates = new Set<number>();
  for (const probe of [guess - 86_400_000 / 2, guess, guess + 86_400_000 / 2]) {
    candidates.add(guess - tzOffsetMs(new Date(probe), timeZone));
  }
  const valid = [...candidates]
    .filter((ts) => {
      const l = toLocal(new Date(ts), timeZone);
      return l.date === date && l.time === time;
    })
    .sort((a, b) => a - b);
  return valid.length ? new Date(valid[0]!) : null;
}

/** 0 = Sunday … 6 = Saturday, for a calendar date (timezone-free). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

export function timeOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
