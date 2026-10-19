import { describe, expect, it } from "vitest";
import { computeSlots, isSlotBookable, type AvailabilityInput, type ServiceRules } from "./slots";
import { fromLocal, toLocal } from "./time";

const service: ServiceRules = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 15, minNoticeMin: 0, maxAdvanceDays: 365, stepMin: 60 };

function weekdays(tz: string, start = "09:00", end = "12:00"): AvailabilityInput {
  return { timezone: tz, weekly: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startLocal: start, endLocal: end })), overrides: {} };
}

describe("time helpers", () => {
  it("round-trips local ↔ UTC", () => {
    const t = fromLocal("2026-10-20", "09:00", "Asia/Damascus")!;
    expect(t.toISOString()).toBe("2026-10-20T06:00:00.000Z");
    expect(toLocal(t, "Asia/Damascus")).toMatchObject({ date: "2026-10-20", time: "09:00" });
  });

  it("returns null for times skipped by DST (Berlin spring forward)", () => {
    expect(fromLocal("2026-03-29", "02:30", "Europe/Berlin")).toBeNull();
  });

  it("resolves ambiguous fall-back times to the earlier instant (New York)", () => {
    const t = fromLocal("2026-11-01", "01:30", "America/New_York")!;
    expect(t.toISOString()).toBe("2026-11-01T05:30:00.000Z"); // EDT, not EST
  });
});

describe("computeSlots", () => {
  const now = new Date("2026-10-01T00:00:00Z");

  it("renders expert availability in the visitor's timezone", () => {
    // Expert in Damascus (UTC+3), visitor in New York (UTC-4 in October).
    const slots = computeSlots(weekdays("Asia/Damascus"), service, [], { from: "2026-10-20", to: "2026-10-20", displayTimezone: "America/New_York", now });
    // 09:00 Damascus = 02:00 NY on the 20th; next day's slots fall on the 21st in NY too.
    expect(slots.map((s) => s.localTime)).toEqual(["02:00", "03:00", "04:00"]);
    expect(slots[0]!.startsAt.toISOString()).toBe("2026-10-20T06:00:00.000Z");
    expect(slots.every((s) => s.localDate === "2026-10-20")).toBe(true);
  });

  it("includes slots that cross the date line for far-east visitors", () => {
    // Expert evening in New York lands on the next calendar day in Riyadh.
    const slots = computeSlots(weekdays("America/New_York", "18:00", "20:00"), service, [], { from: "2026-10-21", to: "2026-10-21", displayTimezone: "Asia/Riyadh", now });
    expect(slots.map((s) => s.localTime)).toEqual(["01:00", "02:00"]);
  });

  it("excludes slots overlapping busy blocks including buffers", () => {
    const busy = [{ start: new Date("2026-10-20T07:00:00Z"), end: new Date("2026-10-20T08:00:00Z") }];
    const slots = computeSlots(weekdays("Asia/Damascus"), service, busy, { from: "2026-10-20", to: "2026-10-20", displayTimezone: "Asia/Damascus", now });
    // 09:00 slot's 15-min after-buffer runs into the 10:00 busy block → excluded; 10:00 busy; 11:00 free.
    expect(slots.map((s) => s.localTime)).toEqual(["11:00"]);
  });

  it("honours overrides (day off and custom hours)", () => {
    const a = { ...weekdays("Asia/Riyadh"), overrides: { "2026-10-20": [], "2026-10-21": [{ startLocal: "14:00", endLocal: "16:00" }] } };
    const slots = computeSlots(a, service, [], { from: "2026-10-20", to: "2026-10-21", displayTimezone: "Asia/Riyadh", now });
    expect(slots.map((s) => `${s.localDate} ${s.localTime}`)).toEqual(["2026-10-21 14:00", "2026-10-21 15:00"]);
  });

  it("applies minimum notice and max advance", () => {
    const n = new Date("2026-10-20T06:30:00Z"); // 09:30 Damascus
    const slots = computeSlots(weekdays("Asia/Damascus"), { ...service, minNoticeMin: 60, maxAdvanceDays: 1 }, [], { from: "2026-10-20", to: "2026-10-25", displayTimezone: "Asia/Damascus", now: n });
    expect(slots[0]!.localTime).toBe("11:00");
    expect(slots.every((s) => s.startsAt.getTime() <= n.getTime() + 86_400_000)).toBe(true);
  });

  it("keeps real 60-minute sessions across the Berlin spring-forward night", () => {
    const a = weekdays("Europe/Berlin", "01:00", "05:00");
    const slots = computeSlots(a, service, [], { from: "2026-03-29", to: "2026-03-29", displayTimezone: "Europe/Berlin", now: new Date("2026-03-01T00:00:00Z") });
    for (const s of slots) expect(s.endsAt.getTime() - s.startsAt.getTime()).toBe(3_600_000);
    expect(slots.map((s) => s.localTime)).not.toContain("02:00");
  });

  it("isSlotBookable re-validates a requested start", () => {
    const a = weekdays("Asia/Damascus");
    expect(isSlotBookable(a, service, [], new Date("2026-10-20T06:00:00Z"), now)).not.toBeNull();
    expect(isSlotBookable(a, service, [], new Date("2026-10-20T06:30:00Z"), now)).toBeNull();
  });
});
