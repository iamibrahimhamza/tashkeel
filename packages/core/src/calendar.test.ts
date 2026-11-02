import { describe, expect, it } from "vitest";
import { buildIcs, reminderDue } from "./calendar";
import { fromLocal } from "./time";

const H = 60 * 60_000;

describe("buildIcs", () => {
  const startsAt = fromLocal("2026-11-16", "10:00", "Asia/Damascus")!;
  const ics = buildIcs({
    uid: "bk_123",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 45 * 60_000),
    summary: "جلسة استشارية مع د. سارة",
    description: "رابط الاجتماع: https://meet.google.com/abc-defg-hij\nنلتقي, إن شاء الله; في الموعد",
    url: "https://meet.google.com/abc-defg-hij",
    stamp: new Date("2026-11-02T12:00:00Z"),
  });
  const unfolded = ics.replace(/\r\n /g, "");

  it("writes the session in UTC (10:00 Damascus = 07:00Z)", () => {
    expect(unfolded).toContain("DTSTART:20261116T070000Z\r\n");
    expect(unfolded).toContain("DTEND:20261116T074500Z\r\n");
    expect(unfolded).toContain("DTSTAMP:20261102T120000Z\r\n");
  });

  it("uses CRLF line endings and a stable uid", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    expect(unfolded).toContain("UID:bk_123@tashkeel\r\n");
  });

  it("escapes commas, semicolons and newlines in text", () => {
    expect(unfolded).toContain("DESCRIPTION:رابط الاجتماع: https://meet.google.com/abc-defg-hij\\nنلتقي\\, إن شاء الله\\; في الموعد\r\n");
  });

  it("folds long lines at 75 octets without breaking Arabic characters", () => {
    const enc = new TextEncoder();
    for (const line of ics.split("\r\n")) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    expect(ics).not.toContain("�");
    expect(unfolded).toContain("SUMMARY:جلسة استشارية مع د. سارة\r\n");
  });

  it("omits the location when there is no meeting link", () => {
    const plain = buildIcs({ uid: "x", startsAt, endsAt: startsAt, summary: "s" });
    expect(plain).not.toContain("LOCATION");
    expect(plain).not.toContain("URL:");
  });
});

describe("reminderDue", () => {
  const startsAt = new Date("2026-11-16T07:00:00Z");
  const at = (hoursBefore: number) => new Date(startsAt.getTime() - hoursBefore * H);

  it("sends the 24h reminder inside the last day, the 1h reminder inside the last hour", () => {
    const booked = at(72);
    expect(reminderDue({ startsAt, bookedAt: booked }, at(30))).toBeNull();
    expect(reminderDue({ startsAt, bookedAt: booked }, at(23.9))).toBe("24h");
    expect(reminderDue({ startsAt, bookedAt: booked }, at(1.5))).toBe("24h");
    expect(reminderDue({ startsAt, bookedAt: booked }, at(0.9))).toBe("1h");
  });

  it("sends nothing once the session has started", () => {
    expect(reminderDue({ startsAt, bookedAt: at(72) }, startsAt)).toBeNull();
    expect(reminderDue({ startsAt, bookedAt: at(72) }, at(-1))).toBeNull();
  });

  it("skips a reminder whose lead time had already passed when the session was booked", () => {
    expect(reminderDue({ startsAt, bookedAt: at(3) }, at(2))).toBeNull();
    expect(reminderDue({ startsAt, bookedAt: at(3) }, at(0.5))).toBe("1h");
    expect(reminderDue({ startsAt, bookedAt: at(0.5) }, at(0.25))).toBeNull();
  });
});
