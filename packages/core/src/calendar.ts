/**
 * Calendar invites (RFC 5545) and session reminders.
 * Times are written in UTC so every calendar app shows them in its own timezone.
 */

export interface CalendarEvent {
  uid: string; // stable per booking, so a re-sent invite updates instead of duplicating
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string;
  url?: string | null;
  stamp?: Date;
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds a content line at 75 octets without splitting a UTF-8 character (Arabic is multi-byte). */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + n > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(e: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tashkeel//Bookings//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@tashkeel`,
    `DTSTAMP:${utc(e.stamp ?? new Date())}`,
    `DTSTART:${utc(e.startsAt)}`,
    `DTEND:${utc(e.endsAt)}`,
    `SUMMARY:${escapeText(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`, `LOCATION:${escapeText(e.url)}`] : []),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export const REMINDER_LEADS = [
  { kind: "1h", leadMs: 60 * 60_000 },
  { kind: "24h", leadMs: 24 * 60 * 60_000 },
] as const;
export type ReminderKind = (typeof REMINDER_LEADS)[number]["kind"];

/**
 * The reminder due for a confirmed session right now, if any. A reminder is only sent when the
 * booking was made before its lead time (no "24 hours to go" for a session booked 3 hours out),
 * and only the nearest one: if the 24h reminder was missed and the session is within the hour,
 * the 1h reminder replaces it.
 */
export function reminderDue(b: { startsAt: Date; bookedAt: Date }, now: Date): ReminderKind | null {
  const until = b.startsAt.getTime() - now.getTime();
  if (until <= 0) return null;
  for (const r of REMINDER_LEADS) {
    if (until <= r.leadMs) return b.bookedAt.getTime() <= b.startsAt.getTime() - r.leadMs ? r.kind : null;
  }
  return null;
}
