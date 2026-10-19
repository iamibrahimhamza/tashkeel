import type { PrismaClient } from "@tashkeel/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/common/prisma.service";
import { InlineQueue, JOB_QUEUE } from "../src/common/queue";
import { startHarness, type Harness } from "./harness";

// No gateway override and no STRIPE_SECRET_KEY: this suite runs against the real sandbox adapter.
let h: Harness;
let prisma: PrismaClient;
let owner: string;
let staff: string;
let superadmin: string;
let workspaceId: string;
let productId: string;
let seq = 0;
const key = () => `sbx-key-${Date.now()}-${++seq}`;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const drain = () => h.app.get<InlineQueue>(JOB_QUEUE).drain();

async function account(email: string, role?: "STAFF" | "SUPERADMIN") {
  await h.http().post("/v1/auth/signup").send({ name: "مستخدم", email, password: "correct-horse-battery" });
  if (role) await prisma.user.update({ where: { email }, data: { platformRole: role } });
  return (await h.http().post("/v1/auth/login").send({ email, password: "correct-horse-battery" })).body.accessToken as string;
}

async function startCheckout() {
  const res = await h.http().post("/v1/checkout/sessions").set("Idempotency-Key", key()).send({ workspaceSlug: "founder", item: { kind: "product", productId }, customer: { email: "reader@example.com" } });
  expect(res.status).toBe(201);
  return { orderId: res.body.orderId as string, sessionId: (res.body.checkoutUrl as string).split("/pay/sandbox/")[1]!, url: res.body.checkoutUrl as string };
}

beforeAll(async () => {
  delete process.env.STRIPE_SECRET_KEY;
  h = await startHarness(54331);
  prisma = h.app.get(PrismaService).db;
  owner = await account("founder@example.com");
  staff = await account("ops@example.com", "STAFF");
  superadmin = await account("root@example.com", "SUPERADMIN");
  workspaceId = (await h.http().post("/v1/workspaces").set(auth(owner)).set("Idempotency-Key", key()).send({ name: "المؤسس", slug: "founder" })).body.id;
  productId = (await prisma.product.create({ data: { workspaceId, type: "FILE", slug: "guide", title: "دليل", priceMinor: 10000n, status: "PUBLISHED" } })).id;
});

afterAll(async () => {
  await h?.close();
});

describe("sandbox checkout", () => {
  it("sends the buyer to the local approval screen instead of Stripe", async () => {
    const c = await startCheckout();
    expect(c.url).toMatch(/^http:\/\/localhost:3000\/pay\/sandbox\/sbx_cs_/);
    const s = await h.http().get(`/v1/sandbox/sessions/${c.sessionId}`);
    expect(s.body).toMatchObject({ kind: "payment", status: "PENDING", amountMinor: "10000", currency: "USD", items: [{ title: "دليل" }] });
  });

  it("approval runs the real pipeline: event stored, order paid, ledger posted", async () => {
    const c = await startCheckout();
    const res = await h.http().post(`/v1/sandbox/sessions/${c.sessionId}/decision`).send({ decision: "approve" });
    expect(res.body.redirectUrl).toBe(`http://localhost:3000/founder/checkout/success?order=${c.orderId}`);
    await drain();

    // Simulated Stripe fee: 2.9% + 30¢ of 100.00 = 3.20
    expect(await prisma.order.findUniqueOrThrow({ where: { id: c.orderId } })).toMatchObject({ status: "PAID", processorFeeMinor: 320n, netMinor: 8880n });
    expect(await prisma.webhookEvent.findFirst({ where: { provider: "sandbox", type: "checkout.session.completed" } })).toMatchObject({ status: "PROCESSED" });
    expect(await prisma.ledgerTransaction.count({ where: { kind: "ORDER_PAID", refId: c.orderId } })).toBe(1);
    expect(await prisma.entitlement.count({ where: { orderItem: { orderId: c.orderId }, status: "ACTIVE" } })).toBe(1);

    const again = await h.http().post(`/v1/sandbox/sessions/${c.sessionId}/decision`).send({ decision: "approve" });
    expect(again.status).toBe(409);
  });

  it("decline closes the order without charging", async () => {
    const c = await startCheckout();
    const res = await h.http().post(`/v1/sandbox/sessions/${c.sessionId}/decision`).send({ decision: "decline" });
    expect(res.body.redirectUrl).toBe("http://localhost:3000/founder");
    await drain();
    expect(await prisma.order.findUniqueOrThrow({ where: { id: c.orderId } })).toMatchObject({ status: "EXPIRED" });
  });

  it("lets staff simulate a refund through the same refund pipeline", async () => {
    const c = await startCheckout();
    await h.http().post(`/v1/sandbox/sessions/${c.sessionId}/decision`).send({ decision: "approve" });
    await drain();
    expect((await h.http().post(`/v1/sandbox/orders/${c.orderId}/refund`).set(auth(owner)).send({ amountMinor: "10000" })).status).toBe(403);
    expect((await h.http().post(`/v1/sandbox/orders/${c.orderId}/refund`).set(auth(staff)).send({ amountMinor: "20000" })).status).toBe(422);
    expect((await h.http().post(`/v1/sandbox/orders/${c.orderId}/refund`).set(auth(staff)).send({ amountMinor: "10000" })).status).toBe(202);
    await drain();
    expect(await prisma.order.findUniqueOrThrow({ where: { id: c.orderId } })).toMatchObject({ status: "REFUNDED" });
  });

  it("does not accept Stripe webhooks while in sandbox mode", async () => {
    const res = await h.http().post("/v1/webhooks/stripe").set("stripe-signature", "t=1,v1=x").set("content-type", "application/json").send("{}");
    expect(res.status).toBe(404);
  });
});

describe("sandbox plan upgrade", () => {
  it("upgrades through the sandbox and applies the new fee", async () => {
    const start = await h.http().post(`/v1/workspaces/${workspaceId}/billing/checkout`).set(auth(owner)).set("Idempotency-Key", key()).send({ planCode: "PRO" });
    expect(start.status).toBe(201);
    const sessionId = (start.body.checkoutUrl as string).split("/pay/sandbox/")[1]!;
    expect((await h.http().get(`/v1/sandbox/sessions/${sessionId}`)).body).toMatchObject({ kind: "subscription", amountMinor: "2900" });

    expect((await h.http().post(`/v1/sandbox/subscriptions/${sessionId}/decision`).set(auth(staff)).send({ decision: "approve" })).status).toBe(403);
    const ok = await h.http().post(`/v1/sandbox/subscriptions/${sessionId}/decision`).set(auth(owner)).send({ decision: "approve" });
    expect(ok.status).toBe(200);
    await drain();
    expect(await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).toMatchObject({ planCode: "PRO" });
  });
});

describe("super admin payment settings", () => {
  it("reports the gateway mode and which keys are missing, without values", async () => {
    expect((await h.http().get("/v1/admin/settings/payments").set(auth(staff))).status).toBe(403);
    const res = await h.http().get("/v1/admin/settings/payments").set(auth(superadmin));
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("sandbox");
    expect(res.body.webhookUrl).toBe("http://localhost:4000/v1/webhooks/stripe");
    expect(res.body.keys.find((k: { name: string }) => k.name === "STRIPE_SECRET_KEY")).toMatchObject({ isSet: false });
    expect(res.body.keys.find((k: { name: string }) => k.name === "PAYOUT_ENCRYPTION_KEY")).toMatchObject({ isSet: true });
    expect(JSON.stringify(res.body)).not.toContain(process.env.PAYOUT_ENCRYPTION_KEY!);
  });
});

describe("dashboard records", () => {
  it("lists real clients, and empty bookings for a workspace that has none", async () => {
    const contacts = await h.http().get(`/v1/workspaces/${workspaceId}/contacts`).set(auth(owner));
    expect(contacts.body.data.map((c: { email: string }) => c.email)).toEqual(["reader@example.com"]);
    expect(contacts.body.pagination).toMatchObject({ totalItems: 1 });
    expect((await h.http().get(`/v1/workspaces/${workspaceId}/bookings`).set(auth(owner))).body).toEqual({ data: [] });
    expect((await h.http().get(`/v1/workspaces/${workspaceId}/products`).set(auth(owner))).body.data).toHaveLength(1);
  });
});
