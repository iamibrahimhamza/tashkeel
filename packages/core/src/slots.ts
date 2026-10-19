import { addDays, fromLocal, minutesOf, timeOf, toLocal, weekdayOf } from "./time";

export interface Window {
  startLocal: string;
  endLocal: string;
}

export interface AvailabilityInput {
  /** Expert's IANA timezone; weekly rules and overrides are in this wall-clock. */
  timezone: string;
  weekly: Array<{ weekday: number; startLocal: string; endLocal: string }>;
  /** date (expert-local) → replacement windows; an empty array means day off. */
  overrides: Record<string, Window[]>;
}

export interface ServiceRules {
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  maxAdvanceDays: number;
  /** Granularity of start times; defaults to 30 minutes. */
  stepMin?: number;
}

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface SlotQuery {
  /** Inclusive visitor-local date range. */
  from: string;
  to: string;
  displayTimezone: string;
  now: Date;
}

export interface ComputedSlot {
  startsAt: Date;
  endsAt: Date;
  blockStartsAt: Date;
  blockEndsAt: Date;
  localDate: string;
  localTime: string;
}

const MIN = 60_000;

/** How long a chosen slot is held for the buyer while they pay. */
export const BOOKING_HOLD_MINUTES = 10;
/** Widest date range the public slots endpoint will compute in one call. */
export const MAX_SLOT_RANGE_DAYS = 62;

function windowsFor(date: string, a: AvailabilityInput): Window[] {
  const override = a.overrides[date];
  if (override) return override;
  const wd = weekdayOf(date);
  return a.weekly.filter((r) => r.weekday === wd).map(({ startLocal, endLocal }) => ({ startLocal, endLocal }));
}

function overlaps(aStart: number, aEnd: number, busy: BusyInterval[]): boolean {
  return busy.some((b) => aStart < b.end.getTime() && b.start.getTime() < aEnd);
}

/**
 * Bookable start times for a service, rendered in the visitor's timezone.
 * Rules are interpreted in the expert's wall-clock per date, so DST transitions are handled:
 * nonexistent local times are skipped and every slot keeps its real duration in UTC.
 */
export function computeSlots(a: AvailabilityInput, s: ServiceRules, busy: BusyInterval[], q: SlotQuery): ComputedSlot[] {
  const step = s.stepMin ?? 30;
  const earliest = q.now.getTime() + s.minNoticeMin * MIN;
  const latest = q.now.getTime() + s.maxAdvanceDays * 86_400_000;
  const out: ComputedSlot[] = [];
  const seen = new Set<number>();

  // Visitor-local dates can straddle two expert-local dates; scan one day of margin each side.
  for (let date = addDays(q.from, -1); date <= addDays(q.to, 1); date = addDays(date, 1)) {
    for (const w of windowsFor(date, a)) {
      const winStart = minutesOf(w.startLocal);
      const winEnd = minutesOf(w.endLocal);
      // The session must end inside the window in real time (a DST jump can shorten a window).
      const winEndInstant = fromLocal(date, w.endLocal, a.timezone);
      for (let m = winStart; m + s.durationMin <= winEnd; m += step) {
        const start = fromLocal(date, timeOf(m), a.timezone);
        if (!start) continue; // skipped by DST
        const startMs = start.getTime();
        const endMs = startMs + s.durationMin * MIN;
        if (winEndInstant && endMs > winEndInstant.getTime()) continue;
        if (startMs < earliest || startMs > latest) continue;
        const blockStart = startMs - s.bufferBeforeMin * MIN;
        const blockEnd = endMs + s.bufferAfterMin * MIN;
        if (overlaps(blockStart, blockEnd, busy)) continue;
        const local = toLocal(start, q.displayTimezone);
        if (local.date < q.from || local.date > q.to) continue;
        if (seen.has(startMs)) continue;
        seen.add(startMs);
        out.push({
          startsAt: start,
          endsAt: new Date(endMs),
          blockStartsAt: new Date(blockStart),
          blockEndsAt: new Date(blockEnd),
          localDate: local.date,
          localTime: local.time,
        });
      }
    }
  }
  return out.sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
}

/** Re-validates a requested start against the same rules (used when creating a booking). */
export function isSlotBookable(a: AvailabilityInput, s: ServiceRules, busy: BusyInterval[], startsAt: Date, now: Date): ComputedSlot | null {
  const local = toLocal(startsAt, a.timezone);
  const slots = computeSlots(a, s, busy, { from: addDays(local.date, -1), to: addDays(local.date, 1), displayTimezone: a.timezone, now });
  return slots.find((x) => x.startsAt.getTime() === startsAt.getTime()) ?? null;
}
