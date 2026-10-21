import type { PrismaClient } from "@tashkeel/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InlineQueue, JOB_QUEUE } from "../src/common/queue";
import { EmailRelay } from "../src/common/email";
import { PrismaService } from "../src/common/prisma.service";
import { FulfillmentService } from "../src/modules/pay/fulfillment.service";
import { PAYMENT_GATEWAY } from "../src/modules/pay/gateway";
import { signPayoutWebhook } from "../src/modules/pay/webhooks.controller";
import { FakeGatewayAdapter, signStripe } from "./fake-provider";
import { startHarness, TEST_SECRETS, type Harness } from "./harness";

const fake = new FakeGatewayAdapter();
let h: Harness;
let prisma: PrismaClient;
let owner: string;
let staff: string;
let workspaceId: string;
let ebookId: string;
const DAY = 86_400_000;

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const drain = () => h.app.get<InlineQueue>(JOB_QUEUE).drain();
let keySeq = 0;
const key = () => `test-key-${Date.now()}-${++keySeq}`;

async function login(email: string, password = "correct-horse-battery") {
  const res = await h.http().post("/v1/auth/login").send({ email, password });
  return res.body.accessToken as string;
}

async function checkout(productId = ebookId, email = "buyer@example.com", k = key()) {
  return h.http().post("/v1/checkout/sessions").set("Idempotency-Key", k).send({ workspaceSlug: "sara", item: { kind: "product", productId }, customer: { email } });
}

async function deliver(type: string, object: Record<string, unknown>, id?: string) {
  const e = signStripe(type, object, id);
  const res = await h.http().post("/v1/webhooks/stripe").set("stripe-signature", e.signature).set("content-type", "application/json").send(e.payload);
  await drain();
  return { res, eventId: e.id };
}

/** Checkout + successful payment webhook. Returns the order id and payment intent id. */
async function paidOrder(productId = ebookId) {
  const c = await checkout(productId);
  const session = fake.sessions.at(-1)!;
  const pi = `pi_${c.body.orderId}`;
  await deliver("checkout.session.completed", { id: session.id, mode: "payment", payment_status: "paid", payment_intent: pi, metadata: { orderId: c.body.orderId } });
  return { orderId: c.body.orderId as string, pi };
}

const balance = async () => (await h.http().get(`/v1/workspaces/${workspaceId}/balance`).set(auth(owner))).body.data[0];

async function ledgerSumsToZero() {
  const [row] = await prisma.$queryRaw<Array<{ s: bigint | null }>>`SELECT SUM("amountMinor")::bigint AS s FROM "LedgerEntry"`;
  return (row?.s ?? 0n) === 0n;
}

beforeAll(async () => {
  h = await startHarness(54330, [{ provide: PAYMENT_GATEWAY, useValue: fake }]);
  prisma = h.app.get(PrismaService).db;
  await h.http().post("/v1/auth/signup").send({ name: "سارة", email: "sara@example.com", password: "correct-horse-battery" });
  owner = await login("sara@example.com");
  const ws = await h.http().post("/v1/workspaces").set(auth(owner)).set("Idempotency-Key", key()).send({ name: "د. سارة", slug: "sara" });
  workspaceId = ws.body.id;

  ebookId = (await prisma.product.create({ data: { workspaceId, type: "FILE", slug: "playbook", title: "دليل النمو", priceMinor: 10000n, status: "PUBLISHED" } })).id;
  await prisma.product.create({ data: { workspaceId, type: "FILE", slug: "draft", title: "مسودة", priceMinor: 500n, status: "DRAFT" } });

  await h.http().post("/v1/auth/signup").send({ name: "Staff", email: "staff@example.com", password: "correct-horse-battery" });
  await prisma.user.update({ where: { email: "staff@example.com" }, data: { platformRole: "STAFF" } });
  staff = await login("staff@example.com");
});

afterAll(async () => {
  await h?.close();
});

describe("checkout", () => {
  it("prices the order server-side, snapshots the plan fee, and is idempotent", async () => {
    const k = key();
    const first = await checkout(ebookId, "buyer@example.com", k);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: "PENDING", checkoutUrl: expect.stringContaining("checkout.stripe.test") });
    expect(fake.sessions.at(-1)!.lineItems[0]!.unitAmountMinor).toBe(10000n);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: first.body.orderId } });
    expect(order).toMatchObject({ subtotalMinor: 10000n, platformFeeMinor: 400n, feeBpsSnapshot: 400, status: "PENDING" });

    const sessionsBefore = fake.sessions.length;
    const retry = await checkout(ebookId, "buyer@example.com", k);
    expect(retry.body.orderId).toBe(first.body.orderId);
    expect(fake.sessions.length).toBe(sessionsBefore);
  });

  it("refuses unpublished products and requires an idempotency key", async () => {
    const draft = await prisma.product.findFirstOrThrow({ where: { slug: "draft" } });
    expect((await checkout(draft.id)).status).toBe(404);
    const noKey = await h.http().post("/v1/checkout/sessions").send({ workspaceSlug: "sara", item: { kind: "product", productId: ebookId }, customer: { email: "a@b.co" } });
    expect(noKey.status).toBe(400);
  });
});

describe("stripe webhooks", () => {
  it("rejects bad signatures", async () => {
    const res = await h.http().post("/v1/webhooks/stripe").set("stripe-signature", "t=1,v1=deadbeef").set("content-type", "application/json").send("{}");
    expect(res.status).toBe(400);
  });

  it("settles a paid order: ledger, fees, entitlement, CRM, emails", async () => {
    const { orderId } = await paidOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order).toMatchObject({ status: "PAID", processorFeeMinor: 320n, platformFeeMinor: 400n, netMinor: 9280n });

    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId } });
    expect(await prisma.entitlement.findUnique({ where: { orderItemId: item.id } })).toMatchObject({ status: "ACTIVE" });
    expect(await prisma.contact.findUnique({ where: { workspaceId_email: { workspaceId, email: "buyer@example.com" } } })).toMatchObject({ lifetimeValueMinor: 10000n });
    expect(await prisma.emailOutbox.count({ where: { dedupeKey: { contains: orderId } } })).toBe(2);
    expect(await balance()).toMatchObject({ currency: "USD", pendingMinor: "9280", availableMinor: "0" });
    expect(await ledgerSumsToZero()).toBe(true);
  });

  it("applies a redelivered or second success event exactly once", async () => {
    const c = await checkout();
    const s = fake.sessions.at(-1)!;
    const obj = { id: s.id, mode: "payment", payment_status: "paid", payment_intent: `pi_dup_${c.body.orderId}`, metadata: { orderId: c.body.orderId } };
    const first = await deliver("checkout.session.completed", obj);
    const again = await deliver("checkout.session.completed", obj, first.eventId);
    expect(again.res.body).toEqual({ received: true, duplicate: true });
    await deliver("checkout.session.async_payment_succeeded", obj);

    expect(await prisma.ledgerTransaction.count({ where: { kind: "ORDER_PAID", refId: c.body.orderId } })).toBe(1);
    expect(await prisma.entitlement.count({ where: { orderItem: { orderId: c.body.orderId } } })).toBe(1);
  });

  it("refuses to settle when the session does not match the order, and records why", async () => {
    const c = await checkout();
    const { eventId } = await deliver("checkout.session.completed", { id: "cs_forged", mode: "payment", payment_status: "paid", payment_intent: "pi_x", metadata: { orderId: c.body.orderId } });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: c.body.orderId } })).toMatchObject({ status: "PENDING" });
    expect(await prisma.webhookEvent.findFirstOrThrow({ where: { eventId } })).toMatchObject({ status: "FAILED", lastError: expect.stringContaining("does not match") });
  });

  it("expires abandoned checkouts", async () => {
    const c = await checkout();
    const s = fake.sessions.at(-1)!;
    await deliver("checkout.session.expired", { id: s.id, mode: "payment", payment_status: "unpaid", payment_intent: null, metadata: { orderId: c.body.orderId } });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: c.body.orderId } })).toMatchObject({ status: "EXPIRED" });
  });
});

describe("refunds and disputes", () => {
  it("posts partial then full refunds by cumulative total and revokes access", async () => {
    const before = BigInt((await balance()).pendingMinor);
    const { orderId, pi } = await paidOrder();
    await deliver("charge.refunded", { payment_intent: pi, amount_refunded: 5000 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: "PARTIALLY_REFUNDED", refundedMinor: 5000n });
    // 9280 earned − (5000 refunded − 200 platform fee returned)
    expect(BigInt((await balance()).pendingMinor) - before).toBe(4480n);

    await deliver("charge.refunded", { payment_intent: pi, amount_refunded: 5000 }); // replay: no-op
    await deliver("charge.refunded", { payment_intent: pi, amount_refunded: 10000 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: "REFUNDED", refundedMinor: 10000n });
    // The expert absorbs Stripe's non-refundable 320 processing fee.
    expect(BigInt((await balance()).pendingMinor) - before).toBe(-320n);
    expect(await prisma.entitlement.findFirst({ where: { orderItem: { orderId } } })).toMatchObject({ status: "REFUNDED" });
    expect(await ledgerSumsToZero()).toBe(true);
  });

  it("unwinds a lost chargeback", async () => {
    const { orderId, pi } = await paidOrder();
    await deliver("charge.dispute.closed", { id: "dp_1", payment_intent: pi, amount: 10000, status: "lost" });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: "REFUNDED" });
    expect(await prisma.ledgerTransaction.count({ where: { kind: "DISPUTE_LOST", refId: { startsWith: orderId } } })).toBe(1);
  });
});

describe("funds release", () => {
  it("moves matured earnings from pending to available, once", async () => {
    const f = h.app.get(FulfillmentService);
    const later = new Date(Date.now() + 8 * DAY);
    const b0 = await balance();
    const released = await f.releaseDueFunds(later);
    expect(released).toBeGreaterThan(0);
    const b1 = await balance();
    expect(b1.pendingMinor).toBe("0");
    expect(BigInt(b1.availableMinor)).toBe(BigInt(b0.pendingMinor) + BigInt(b0.availableMinor));
    expect(await f.releaseDueFunds(later)).toBe(0);
    expect(await ledgerSumsToZero()).toBe(true);
  });

  it("debits AVAILABLE for refunds after release", async () => {
    const f = h.app.get(FulfillmentService);
    const { pi } = await paidOrder();
    await f.releaseDueFunds(new Date(Date.now() + 8 * DAY));
    const before = await balance();
    await deliver("charge.refunded", { payment_intent: pi, amount_refunded: 2000 });
    const after = await balance();
    expect(BigInt(before.availableMinor) - BigInt(after.availableMinor)).toBe(2000n - 80n);
    expect(after.pendingMinor).toBe(before.pendingMinor);
  });
});

describe("payouts", () => {
  let profileId: string;

  it("stores payout details encrypted and only ever returns a masked hint", async () => {
    const res = await h.http().post(`/v1/workspaces/${workspaceId}/payout-profiles`).set(auth(owner))
      .send({ label: "شام كاش", details: { method: "SHAM_CASH", fullName: "سارة أحمد", walletId: "SC99887766", phone: "+963933000000" }, isDefault: true });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), method: "SHAM_CASH", label: "شام كاش", maskedHint: "•••• 7766", isDefault: true, isVerified: false });
    profileId = res.body.id;
    const row = await prisma.payoutProfile.findUniqueOrThrow({ where: { id: profileId } });
    expect(row.detailsEncrypted).not.toContain("SC99887766");
    expect(JSON.stringify((await h.http().get(`/v1/workspaces/${workspaceId}/payout-profiles`).set(auth(owner))).body)).not.toContain("SC99887766");
  });

  it("rejects amounts above the available balance or below the minimum", async () => {
    const tooMuch = await h.http().post(`/v1/workspaces/${workspaceId}/payouts`).set(auth(owner)).set("Idempotency-Key", key()).send({ profileId, amountMinor: "99999999", currency: "USD" });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.error.code).toBe("INSUFFICIENT_BALANCE");
    const tiny = await h.http().post(`/v1/workspaces/${workspaceId}/payouts`).set(auth(owner)).set("Idempotency-Key", key()).send({ profileId, amountMinor: "100", currency: "USD" });
    expect(tiny.status).toBe(422);
  });

  it("never lets concurrent requests overdraw the balance", async () => {
    const available = BigInt((await balance()).availableMinor);
    const share = ((available / 2n) + 100n).toString(); // two of these exceed the balance
    const [a, b] = await Promise.all([
      h.http().post(`/v1/workspaces/${workspaceId}/payouts`).set(auth(owner)).set("Idempotency-Key", key()).send({ profileId, amountMinor: share, currency: "USD" }),
      h.http().post(`/v1/workspaces/${workspaceId}/payouts`).set(auth(owner)).set("Idempotency-Key", key()).send({ profileId, amountMinor: share, currency: "USD" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 422]);
    const bal = await balance();
    expect(BigInt(bal.availableMinor)).toBeGreaterThanOrEqual(0n);
    expect(bal.inTransitMinor).toBe(share);
  });

  it("lets staff execute a manual payout with a transfer reference", async () => {
    const pending = (await h.http().get(`/v1/workspaces/${workspaceId}/payouts`).set(auth(owner))).body.data[0];
    expect((await h.http().patch(`/v1/admin/payouts/${pending.id}`).set(auth(owner)).send({ to: "APPROVED", complianceChecked: true })).status).toBe(403);

    const detail = await h.http().get(`/v1/admin/payouts/${pending.id}`).set(auth(staff));
    expect(detail.body.destination.details).toMatchObject({ method: "SHAM_CASH", walletId: "SC99887766" });
    expect(await prisma.auditLog.count({ where: { action: "payout.details_viewed", target: pending.id } })).toBe(1);

    expect((await h.http().patch(`/v1/admin/payouts/${pending.id}`).set(auth(staff)).send({ to: "APPROVED" })).status).toBe(422);
    expect((await h.http().patch(`/v1/admin/payouts/${pending.id}`).set(auth(staff)).send({ to: "APPROVED", complianceChecked: true })).body.status).toBe("APPROVED");
    const paid = await h.http().patch(`/v1/admin/payouts/${pending.id}`).set(auth(staff)).send({ to: "PAID", providerRef: "SC-TX-0001" });
    expect(paid.body).toMatchObject({ status: "PAID", providerRef: "SC-TX-0001" });
    expect((await balance()).inTransitMinor).toBe("0");
    expect(await prisma.emailOutbox.count({ where: { template: "payout_paid" } })).toBe(1);

    expect((await h.http().patch(`/v1/admin/payouts/${pending.id}`).set(auth(staff)).send({ to: "FAILED", reason: "oops" })).status).toBe(409);
    expect(await ledgerSumsToZero()).toBe(true);
  });

  it("applies signed provider callbacks and returns failed payouts to the balance", async () => {
    const before = await balance();
    const req = await h.http().post(`/v1/workspaces/${workspaceId}/payouts`).set(auth(owner)).set("Idempotency-Key", key()).send({ profileId, amountMinor: "2000", currency: "USD" });
    expect(req.status).toBe(201);

    const body = JSON.stringify({ eventId: "sc_evt_1", payoutId: req.body.id, status: "FAILED", reason: "wallet closed" });
    const bad = await h.http().post("/v1/webhooks/payouts/sham_cash").set("x-tashkeel-signature", signPayoutWebhook(body, "wrong-secret")).set("content-type", "application/json").send(body);
    expect(bad.status).toBe(400);

    const ok = await h.http().post("/v1/webhooks/payouts/sham_cash").set("x-tashkeel-signature", signPayoutWebhook(body, TEST_SECRETS.payoutWebhook)).set("content-type", "application/json").send(body);
    expect(ok.status).toBe(200);
    await drain();
    expect(await prisma.payout.findUniqueOrThrow({ where: { id: req.body.id } })).toMatchObject({ status: "FAILED", failureReason: "wallet closed" });
    expect((await balance()).availableMinor).toBe(before.availableMinor);

    // A callback from a different rail than the payout was sent on is refused.
    const req2 = await h.http().post(`/v1/workspaces/${workspaceId}/payouts`).set(auth(owner)).set("Idempotency-Key", key()).send({ profileId, amountMinor: "2000", currency: "USD" });
    const wrong = JSON.stringify({ eventId: "ab_evt_1", payoutId: req2.body.id, status: "PAID", providerRef: "X" });
    await h.http().post("/v1/webhooks/payouts/al_baraka").set("x-tashkeel-signature", signPayoutWebhook(wrong, TEST_SECRETS.payoutWebhook)).set("content-type", "application/json").send(wrong);
    await drain();
    expect(await prisma.payout.findUniqueOrThrow({ where: { id: req2.body.id } })).toMatchObject({ status: "REQUESTED" });
  });

  it("lets the owner cancel a payout that has not started", async () => {
    const p = (await h.http().get(`/v1/workspaces/${workspaceId}/payouts`).set(auth(owner))).body.data.find((x: { status: string }) => x.status === "REQUESTED");
    const res = await h.http().post(`/v1/workspaces/${workspaceId}/payouts/${p.id}/cancel`).set(auth(owner));
    expect(res.body.status).toBe("CANCELLED");
    expect((await balance()).inTransitMinor).toBe("0");
  });
});

describe("subscriptions and feeds", () => {
  it("syncs the plan from the processor and applies its fee to new orders", async () => {
    fake.subscriptions.set("sub_1", { id: "sub_1", status: "active", customerId: "cus_1", priceId: "price_pro", workspaceId, currentPeriodEnd: new Date(Date.now() + 30 * DAY) });
    await deliver("customer.subscription.updated", { id: "sub_1" });
    expect(await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).toMatchObject({ planCode: "PRO" });
    const c = await checkout();
    expect(await prisma.order.findUniqueOrThrow({ where: { id: c.body.orderId } })).toMatchObject({ feeBpsSnapshot: 200, platformFeeMinor: 200n });
  });

  it("serves the expert's ledger and orders as cursor pages", async () => {
    const l1 = await h.http().get(`/v1/workspaces/${workspaceId}/ledger?limit=3`).set(auth(owner));
    expect(l1.body.data).toHaveLength(3);
    const l2 = await h.http().get(`/v1/workspaces/${workspaceId}/ledger?limit=3&cursor=${l1.body.nextCursor}`).set(auth(owner));
    expect(l2.body.data[0].id).not.toBe(l1.body.data[2].id);
    const orders = await h.http().get(`/v1/workspaces/${workspaceId}/orders?status=PAID`).set(auth(owner));
    expect(orders.body.data.every((o: { status: string }) => o.status === "PAID")).toBe(true);
  });

  it("relays the email outbox once", async () => {
    const relay = h.app.get(EmailRelay);
    const sent = await relay.relayBatch(100);
    expect(sent).toBeGreaterThan(0);
    expect(await prisma.emailOutbox.count({ where: { sentAt: null } })).toBe(0);
    expect(await relay.relayBatch(100)).toBe(0);
  });
});
