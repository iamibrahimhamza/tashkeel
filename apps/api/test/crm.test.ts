import { addDays, toLocal, weekdayOf } from "@tashkeel/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./harness";

let h: Harness;
let owner: string;
let workspaceId: string;
let contactId: string;
let seq = 0;

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const key = () => `crm-${Date.now()}-${++seq}`;
const TZ = "Asia/Riyadh";
const monday = (() => {
  let d = addDays(toLocal(new Date(), TZ).date, 10);
  while (weekdayOf(d) !== 1) d = addDays(d, 1);
  return d;
})();

async function expert(email: string, slug: string) {
  const token = (await h.http().post("/v1/auth/signup").send({ name: "خبير", email, password: "correct-horse-battery" })).body.accessToken as string;
  const id = (await h.http().post("/v1/workspaces").set(auth(token)).set("Idempotency-Key", key()).send({ name: "د. ريم", slug, timezone: TZ })).body.id as string;
  return { token, id };
}

beforeAll(async () => {
  delete process.env.STRIPE_SECRET_KEY; // sandbox gateway
  h = await startHarness(54334);
  ({ token: owner, id: workspaceId } = await expert("reem@example.com", "reem"));

  // A real free booking, so the contact, order and activity come from the production path.
  const serviceId = (await h.http().post(`/v1/workspaces/${workspaceId}/services`).set(auth(owner)).send({ title: "مكالمة تعارف", durationMin: 30, priceMinor: "0" })).body.id;
  await h.http().put(`/v1/workspaces/${workspaceId}/availability`).set(auth(owner)).send({ timezone: TZ, weekly: [{ weekday: 1, windows: [{ startLocal: "10:00", endLocal: "12:00" }] }], overrides: [] });
  const slots = await h.http().get(`/v1/public/homes/reem/services/${serviceId}/slots?from=${monday}&to=${monday}&tz=${TZ}`);
  expect(slots.status, JSON.stringify(slots.body)).toBe(200);
  const booked = await h.http().post("/v1/public/bookings").set("Idempotency-Key", key())
    .send({ serviceId, startsAt: slots.body.slots[0].startsAt, customerTz: TZ, customer: { name: "نور", email: "nour@example.com" } });
  expect(booked.body.status).toBe("CONFIRMED");

  const list = await h.http().get(`/v1/workspaces/${workspaceId}/contacts`).set(auth(owner));
  contactId = list.body.data[0].id;
});
afterAll(async () => {
  await h?.close();
});

describe("client record", () => {
  it("shows the client's bookings, orders and activity", async () => {
    const res = await h.http().get(`/v1/workspaces/${workspaceId}/contacts/${contactId}`).set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.body.contact).toMatchObject({ email: "nour@example.com", name: "نور" });
    expect(res.body.bookings).toEqual([expect.objectContaining({ serviceTitle: "مكالمة تعارف", status: "CONFIRMED" })]);
    expect(res.body.orders).toEqual([expect.objectContaining({ status: "PAID", subtotalMinor: "0", items: ["مكالمة تعارف"] })]);
    expect(res.body.activity.map((a: { type: string }) => a.type)).toEqual(["ORDER_PAID"]);
    expect(res.body.notes).toEqual([]);
  });

  it("adds and deletes private notes", async () => {
    const empty = await h.http().post(`/v1/workspaces/${workspaceId}/contacts/${contactId}/notes`).set(auth(owner)).send({ body: "   " });
    expect(empty.status).toBe(422);

    const note = await h.http().post(`/v1/workspaces/${workspaceId}/contacts/${contactId}/notes`).set(auth(owner)).send({ body: "مهتمة بخطة تسويق لمتجرها. نتابع بعد الجلسة الأولى." });
    expect(note.status).toBe(201);
    expect(note.body).toMatchObject({ body: "مهتمة بخطة تسويق لمتجرها. نتابع بعد الجلسة الأولى.", author: "خبير" });

    const detail = await h.http().get(`/v1/workspaces/${workspaceId}/contacts/${contactId}`).set(auth(owner));
    expect(detail.body.notes).toHaveLength(1);

    expect((await h.http().delete(`/v1/workspaces/${workspaceId}/contacts/${contactId}/notes/${note.body.id}`).set(auth(owner))).status).toBe(204);
    expect((await h.http().delete(`/v1/workspaces/${workspaceId}/contacts/${contactId}/notes/${note.body.id}`).set(auth(owner))).status).toBe(404);
    expect((await h.http().get(`/v1/workspaces/${workspaceId}/contacts/${contactId}`).set(auth(owner))).body.notes).toEqual([]);
  });

  it("does not reach another expert's client through one's own workspace", async () => {
    const other = await expert("other@example.com", "other-expert");
    expect((await h.http().get(`/v1/workspaces/${other.id}/contacts/${contactId}`).set(auth(other.token))).status).toBe(404);
    expect((await h.http().post(`/v1/workspaces/${other.id}/contacts/${contactId}/notes`).set(auth(other.token)).send({ body: "x" })).status).toBe(404);

    const note = await h.http().post(`/v1/workspaces/${workspaceId}/contacts/${contactId}/notes`).set(auth(owner)).send({ body: "خاص" });
    const otherContact = await h.http().get(`/v1/workspaces/${other.id}/contacts`).set(auth(other.token));
    expect(otherContact.body.data).toEqual([]);
    expect((await h.http().delete(`/v1/workspaces/${other.id}/contacts/${contactId}/notes/${note.body.id}`).set(auth(other.token))).status).toBe(404);
  });
});
