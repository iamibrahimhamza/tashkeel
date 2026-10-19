import { addDays, toLocal, weekdayOf } from "@tashkeel/core";
import type { PrismaClient } from "@tashkeel/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/common/prisma.service";
import { InlineQueue, JOB_QUEUE } from "../src/common/queue";
import { HoldsService } from "../src/modules/booking/holds.service";
import { startHarness, type Harness } from "./harness";

let h: Harness;
let prisma: PrismaClient;
let owner: string;
let workspaceId: string;
let serviceId: string;
let freeServiceId: string;
let seq = 0;
const key = () => `bk-${Date.now()}-${++seq}`;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const drain = () => h.app.get<InlineQueue>(JOB_QUEUE).drain();
const W = (startLocal: string, endLocal: string) => ({ startLocal, endLocal });

// A weekday ~10 days out, in the expert's calendar, so min-notice never interferes.
const EXPERT_TZ = "Asia/Damascus";
const day = (() => {
  let d = addDays(toLocal(new Date(), EXPERT_TZ).date, 10);
  while (weekdayOf(d) !== 1) d = addDays(d, 1); // Monday
  return d;
})();

const slots = (tz: string, from = day, to = day, sid = serviceId) => h.http().get(`/v1/public/homes/booker/services/${sid}/slots?from=${from}&to=${to}&tz=${encodeURIComponent(tz)}`);
const book = (startsAt: string, opts: { k?: string; email?: string; sid?: string } = {}) =>
  h.http()
    .post("/v1/public/bookings")
    .set("Idempotency-Key", opts.k ?? key())
    .send({ serviceId: opts.sid ?? serviceId, startsAt, customerTz: "Europe/Berlin", customer: { name: "عميل تجريبي", email: opts.email ?? "client@example.com" } });

beforeAll(async () => {
  delete process.env.STRIPE_SECRET_KEY; // sandbox gateway
  h = await startHarness(54332);
  prisma = h.app.get(PrismaService).db;
  await h.http().post("/v1/auth/signup").send({ name: "خبير", email: "expert@example.com", password: "correct-horse-battery" });
  owner = (await h.http().post("/v1/auth/login").send({ email: "expert@example.com", password: "correct-horse-battery" })).body.accessToken;
  workspaceId = (await h.http().post("/v1/workspaces").set(auth(owner)).set("Idempotency-Key", key()).send({ name: "خبير", slug: "booker" })).body.id;
});

afterAll(async () => {
  await h?.close();
});

describe("services", () => {
  it("creates services with validated rules", async () => {
    const bad = await h.http().post(`/v1/workspaces/${workspaceId}/services`).set(auth(owner)).send({ title: "x", durationMin: 5, priceMinor: "100" });
    expect(bad.status).toBe(422);
    const ok = await h.http().post(`/v1/workspaces/${workspaceId}/services`).set(auth(owner)).send({ title: "جلسة استشارية", durationMin: 60, bufferAfterMin: 15, priceMinor: "15000", minNoticeMin: 60, maxAdvanceDays: 60 });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ durationMin: 60, bufferAfterMin: 15, priceMinor: "15000", currency: "USD", isActive: true });
    serviceId = ok.body.id;
    freeServiceId = (await h.http().post(`/v1/workspaces/${workspaceId}/services`).set(auth(owner)).send({ title: "مكالمة تعارف", durationMin: 20, priceMinor: "0" })).body.id;
    const list = await h.http().get(`/v1/workspaces/${workspaceId}/services`).set(auth(owner));
    expect(list.body.data).toHaveLength(2);
  });

  it("can deactivate a service, which hides it publicly", async () => {
    await h.http().patch(`/v1/workspaces/${workspaceId}/services/${freeServiceId}`).set(auth(owner)).send({ isActive: false });
    expect((await h.http().get(`/v1/public/homes/booker/services/${freeServiceId}`)).status).toBe(404);
    await h.http().patch(`/v1/workspaces/${workspaceId}/services/${freeServiceId}`).set(auth(owner)).send({ isActive: true });
  });
});

describe("availability", () => {
  it("rejects overlapping windows", async () => {
    const res = await h.http().put(`/v1/workspaces/${workspaceId}/availability`).set(auth(owner)).send({ timezone: EXPERT_TZ, weekly: [{ weekday: 1, windows: [W("10:00", "13:00"), W("12:00", "14:00")] }] });
    expect(res.status).toBe(422);
  });

  it("replaces the weekly schedule and its overrides", async () => {
    const res = await h.http().put(`/v1/workspaces/${workspaceId}/availability`).set(auth(owner)).send({
      timezone: EXPERT_TZ,
      weekly: [1, 2, 3].map((weekday) => ({ weekday, windows: [W("10:00", "13:00")] })),
      overrides: [{ date: addDays(day, 1), windows: [] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe(EXPERT_TZ);
    expect(res.body.weekly).toHaveLength(3);
    expect(res.body.overrides).toEqual([{ date: addDays(day, 1), windows: [] }]);
  });
});

describe("public slots", () => {
  it("renders the expert's hours in the visitor's timezone", async () => {
    const local = await slots(EXPERT_TZ);
    // 10:00–13:00 with a 60-min session and 15-min after-buffer, every 30 min: 10:00, 10:30, 11:00, 11:30, 12:00
    expect(local.body.slots.map((s: { localTime: string }) => s.localTime)).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00"]);
    expect(local.body.expertTimezone).toBe(EXPERT_TZ);

    const ny = await slots("America/New_York", addDays(day, -1), addDays(day, 1));
    const first = ny.body.slots[0];
    expect(first.startsAt).toBe(local.body.slots[0].startsAt);
    expect(first.localTime).not.toBe("10:00"); // shifted into the visitor's clock
  });

  it("respects day-off overrides", async () => {
    const off = await slots(EXPERT_TZ, addDays(day, 1), addDays(day, 1));
    expect(off.body.slots).toEqual([]);
  });

  it("rejects ranges over 62 days", async () => {
    expect((await slots(EXPERT_TZ, day, addDays(day, 70))).status).toBe(422);
  });
});

describe("holds and checkout", () => {
  let firstSlot: string;

  it("holds a slot for 10 minutes and opens sandbox checkout", async () => {
    firstSlot = (await slots(EXPERT_TZ)).body.slots[0].startsAt;
    const res = await book(firstSlot);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "PENDING_PAYMENT", checkoutUrl: expect.stringContaining("/pay/sandbox/") });
    const holdMs = Date.parse(res.body.holdExpiresAt) - Date.now();
    expect(holdMs).toBeGreaterThan(9 * 60_000);
    expect(holdMs).toBeLessThanOrEqual(10 * 60_000);

    // The held slot and the ones its buffer overlaps disappear for everyone else.
    const after = (await slots(EXPERT_TZ)).body.slots.map((s: { startsAt: string }) => s.startsAt);
    expect(after).not.toContain(firstSlot);
  });

  it("refuses a second booking for the same time, including concurrent attempts", async () => {
    expect((await book(firstSlot, { email: "other@example.com" })).status).toBe(409);
    const next = (await slots(EXPERT_TZ)).body.slots.at(-1).startsAt;
    const [a, b] = await Promise.all([book(next, { email: "a@example.com" }), book(next, { email: "b@example.com" })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it("refuses times outside availability", async () => {
    const midnight = new Date(Date.parse(firstSlot) - 8 * 3_600_000).toISOString();
    const res = await book(midnight);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SLOT_UNAVAILABLE");
  });

  it("is idempotent per Idempotency-Key", async () => {
    const nextMonday = addDays(day, 7);
    const free = (await slots(EXPERT_TZ, nextMonday, nextMonday)).body.slots[0].startsAt;
    const k = key();
    const one = await book(free, { k, email: "idem@example.com" });
    const two = await book(free, { k, email: "idem@example.com" });
    expect(two.body.bookingId).toBe(one.body.bookingId);
  });

  it("releases lapsed holds: booking cancelled, order expired, slot free again", async () => {
    const holds = h.app.get(HoldsService);
    const released = await holds.expireDue(new Date(Date.now() + 11 * 60_000));
    expect(released).toBeGreaterThanOrEqual(1);
    const b = await prisma.booking.findFirstOrThrow({ where: { startsAt: new Date(firstSlot), customer: { email: "client@example.com" } }, include: { orderItem: { include: { order: true } } } });
    expect(b.status).toBe("CANCELLED");
    expect(b.orderItem?.order.status).toBe("EXPIRED");
    expect((await slots(EXPERT_TZ)).body.slots.map((s: { startsAt: string }) => s.startsAt)).toContain(firstSlot);
  });

  it("confirms the booking when the sandbox payment is approved", async () => {
    const res = await book(firstSlot, { email: "payer@example.com" });
    const sessionId = (res.body.checkoutUrl as string).split("/pay/sandbox/")[1];
    await h.http().post(`/v1/sandbox/sessions/${sessionId}/decision`).send({ decision: "approve" });
    await drain();

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: res.body.bookingId } });
    expect(booking).toMatchObject({ status: "CONFIRMED", holdExpiresAt: null });
    const list = await h.http().get(`/v1/workspaces/${workspaceId}/bookings`).set(auth(owner));
    expect(list.body.data.map((x: { id: string }) => x.id)).toContain(res.body.bookingId);
    expect(await prisma.emailOutbox.count({ where: { template: { in: ["booking_confirmed", "new_booking"] }, dedupeKey: { contains: res.body.bookingId } } })).toBe(2);

    const status = await h.http().get(`/v1/checkout/orders/${res.body.orderId}`);
    expect(status.body.booking).toMatchObject({ startsAt: firstSlot, customerTz: "Europe/Berlin", status: "CONFIRMED" });
  });

  it("confirms free sessions immediately without checkout", async () => {
    const freeSlot = (await slots(EXPERT_TZ, day, day, freeServiceId)).body.slots.at(-1).startsAt;
    const res = await book(freeSlot, { sid: freeServiceId, email: "free@example.com" });
    expect(res.body).toMatchObject({ status: "CONFIRMED", checkoutUrl: null, holdExpiresAt: null });
  });
});
