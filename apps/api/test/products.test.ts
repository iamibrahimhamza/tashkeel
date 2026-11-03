import type { PrismaClient } from "@tashkeel/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderEmail } from "../src/common/email";
import { PrismaService } from "../src/common/prisma.service";
import { InlineQueue, JOB_QUEUE } from "../src/common/queue";
import { startHarness, type Harness } from "./harness";

let h: Harness;
let prisma: PrismaClient;
let owner: string;
let workspaceId: string;
let productId: string;
let fileId: string;
let token: string;
let seq = 0;

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const key = () => `prod-${Date.now()}-${++seq}`;
const drain = () => h.app.get<InlineQueue>(JOB_QUEUE).drain();
const base = () => `/v1/workspaces/${workspaceId}/products`;
/** Signed URLs are absolute (API_URL); the harness serves the same app in-process. */
const local = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};
const PDF = Buffer.from("%PDF-1.7\n% دليل تجريبي\n" + "x".repeat(2000));

async function expert(email: string, slug: string) {
  const t = (await h.http().post("/v1/auth/signup").send({ name: "خبير", email, password: "correct-horse-battery" })).body.accessToken as string;
  const id = (await h.http().post("/v1/workspaces").set(auth(t)).set("Idempotency-Key", key()).send({ name: "د. سلمى", slug, timezone: "Asia/Dubai" })).body.id as string;
  return { token: t, id };
}

async function upload(name: string, body: Buffer, mime = "application/pdf") {
  const ticket = await h.http().post(`${base()}/${productId}/files`).set(auth(owner)).send({ fileName: name, mime, sizeBytes: body.length });
  expect(ticket.status, JSON.stringify(ticket.body)).toBe(201);
  return ticket.body as { fileId: string; uploadUrl: string; mime: string };
}

async function buy(email: string) {
  const res = await h.http().post("/v1/checkout/sessions").set("Idempotency-Key", key()).send({ workspaceSlug: "salma", item: { kind: "product", productId }, customer: { email } });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  await h.http().post(`/v1/sandbox/sessions/${(res.body.checkoutUrl as string).split("/pay/sandbox/")[1]}/decision`).send({ decision: "approve" });
  await drain();
  const mail = await prisma.emailOutbox.findFirstOrThrow({ where: { to: email, template: "product_ready" }, orderBy: { createdAt: "desc" } });
  return { mail, token: String((mail.data as { link: string }).link).split("/d/")[1]! };
}

beforeAll(async () => {
  delete process.env.STRIPE_SECRET_KEY; // sandbox gateway
  h = await startHarness(54335);
  prisma = h.app.get(PrismaService).db;
  ({ token: owner, id: workspaceId } = await expert("salma@example.com", "salma"));
});
afterAll(async () => {
  await h?.close();
});

describe("product editor", () => {
  it("creates drafts and refuses to publish without a file", async () => {
    const course = await h.http().post(base()).set(auth(owner)).send({ type: "COURSE", slug: "course", title: "دورة", priceMinor: "1000" });
    expect(course.status).toBe(422);

    const res = await h.http().post(base()).set(auth(owner)).send({ slug: "growth-guide", title: "دليل النمو للمتاجر", priceMinor: "2500", status: "PUBLISHED" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "DRAFT", files: [], coverUrl: null });
    productId = res.body.id;

    const publish = await h.http().patch(`${base()}/${productId}`).set(auth(owner)).send({ status: "PUBLISHED" });
    expect(publish.status).toBe(422);
  });

  it("validates file type and size before handing out an upload URL", async () => {
    expect((await h.http().post(`${base()}/${productId}/files`).set(auth(owner)).send({ fileName: "a.exe", mime: "application/x-msdownload", sizeBytes: 10 })).status).toBe(422);
    expect((await h.http().post(`${base()}/${productId}/files`).set(auth(owner)).send({ fileName: "big.pdf", mime: "application/pdf", sizeBytes: 200 * 1024 ** 2 + 1 })).status).toBe(422);
  });

  it("uploads straight to storage, then verifies the stored size", async () => {
    const t = await upload("دليل النمو.pdf", PDF);
    fileId = t.fileId;

    // Not uploaded yet: nothing to confirm.
    expect((await h.http().post(`${base()}/${productId}/files/${fileId}/complete`).set(auth(owner))).status).toBe(422);
    // The signed URL is bound to its content type and declared size.
    expect((await h.http().put(local(t.uploadUrl)).set("content-type", "image/png").send(PDF)).status).toBe(403);
    expect((await h.http().put(local(t.uploadUrl)).set("content-type", t.mime).send(Buffer.concat([PDF, PDF]))).status).toBe(422);

    expect((await h.http().put(local(t.uploadUrl)).set("content-type", t.mime).send(PDF)).status).toBe(200);
    const done = await h.http().post(`${base()}/${productId}/files/${fileId}/complete`).set(auth(owner));
    expect(done.status).toBe(200);
    expect(done.body.files).toEqual([{ id: fileId, fileName: "دليل النمو.pdf", sizeBytes: String(PDF.length), mime: "application/pdf", uploaded: true }]);
  });

  it("rejects tampered or traversing storage URLs", async () => {
    const t = await upload("other.pdf", PDF);
    const tampered = local(t.uploadUrl).replace(/size=\d+/, "size=999999999");
    expect((await h.http().put(tampered).set("content-type", t.mime).send(PDF)).status).toBe(403);
    expect((await h.http().get("/v1/storage/local?op=get&key=..%2F..%2Fetc%2Fpasswd&exp=9999999999&name=x&inline=0&sig=abc")).status).toBe(403);
    // Never completed: deleting the pending row tidies up.
    expect((await h.http().delete(`${base()}/${productId}/files/${t.fileId}`).set(auth(owner))).status).toBe(200);
  });

  it("publishes once a file is uploaded, and lists only uploaded files publicly", async () => {
    await upload("pending.pdf", PDF); // requested but never uploaded
    const res = await h.http().patch(`${base()}/${productId}`).set(auth(owner)).send({ status: "PUBLISHED" });
    expect(res.status).toBe(200);
    const page = await h.http().get("/v1/public/homes/salma/products/growth-guide");
    expect(page.body.product.files).toEqual([{ fileName: "دليل النمو.pdf", sizeBytes: String(PDF.length), mime: "application/pdf" }]);
  });

  it("keeps at least one file on a published product", async () => {
    expect((await h.http().delete(`${base()}/${productId}/files/${fileId}`).set(auth(owner))).status).toBe(409);
  });

  it("sets a cover served through a signed redirect", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const t = await h.http().post(`${base()}/${productId}/cover`).set(auth(owner)).send({ mime: "image/png", sizeBytes: png.length });
    expect(t.status).toBe(201);
    await h.http().put(local(t.body.uploadUrl)).set("content-type", "image/png").send(png);
    const forged = await h.http().post(`${base()}/${productId}/cover/complete`).set(auth(owner)).send({ key: "ws/other/covers/x/y" });
    expect(forged.status).toBe(404);
    const done = await h.http().post(`${base()}/${productId}/cover/complete`).set(auth(owner)).send({ key: t.body.fileId });
    expect(done.body.coverUrl).toMatch(new RegExp(`/v1/public/products/${productId}/cover\\?v=`));
    const cover = await h.http().get(local(done.body.coverUrl));
    expect(cover.status).toBe(302);
    const img = await h.http().get(local(cover.headers.location!));
    expect(Buffer.from(img.body)).toEqual(png);
  });

  it("does not reach another expert's product through one's own workspace", async () => {
    const other = await expert("other@example.com", "other-salma");
    expect((await h.http().get(`/v1/workspaces/${other.id}/products/${productId}`).set(auth(other.token))).status).toBe(404);
    expect((await h.http().post(`/v1/workspaces/${other.id}/products/${productId}/files`).set(auth(other.token)).send({ fileName: "x.pdf", mime: "application/pdf", sizeBytes: 10 })).status).toBe(404);
  });
});

describe("buyer downloads", () => {
  it("emails a private link once the payment settles", async () => {
    const bought = await buy("reader@example.com");
    token = bought.token;
    const mail = renderEmail(bought.mail);
    expect(mail.subject).toContain("دليل النمو للمتاجر");
    expect(mail.text).toContain(`/d/${token}`);
    // Only the hash is stored.
    expect(JSON.stringify(await prisma.downloadAccess.findMany())).not.toContain(token);
  });

  it("lists the files and serves each download through a five-minute URL", async () => {
    const page = await h.http().get(`/v1/public/downloads/${token}`);
    expect(page.body).toMatchObject({ product: { title: "دليل النمو للمتاجر" }, expert: { slug: "salma" }, downloadsLeft: 5 });
    expect(page.body.files.map((f: { id: string }) => f.id)).toEqual([fileId]);

    const link = await h.http().post(`/v1/public/downloads/${token}/files/${fileId}`);
    expect(link.status).toBe(200);
    expect(Date.parse(link.body.expiresAt) - Date.now()).toBeLessThanOrEqual(5 * 60_000);
    const file = await h.http().get(local(link.body.url)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(file.headers["content-disposition"]).toContain(`filename*=UTF-8''${encodeURIComponent("دليل النمو.pdf")}`);
    expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);
  });

  it("never spends more downloads than the link allows, even under concurrent clicks", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => h.http().post(`/v1/public/downloads/${token}/files/${fileId}`)));
    const ok = results.filter((r) => r.status === 200).length;
    expect(ok).toBe(4); // 5 allowed, 1 already used
    expect(results.find((r) => r.status !== 200)?.body.error.code).toBe("DOWNLOAD_LIMIT_REACHED");
    expect((await h.http().get(`/v1/public/downloads/${token}`)).body.downloadsLeft).toBe(0);
    expect(await prisma.downloadGrant.count({ where: { fileId } })).toBe(5);
  });

  it("sends a fresh link on request, at most once per cooldown, without revealing buyers", async () => {
    const before = await prisma.emailOutbox.count({ where: { template: "product_ready", to: "reader@example.com" } });
    expect((await h.http().post("/v1/public/downloads/resend").send({ email: "Reader@Example.com" })).status).toBe(202);
    expect(await prisma.emailOutbox.count({ where: { template: "product_ready", to: "reader@example.com" } })).toBe(before); // the purchase itself was within the cooldown

    await prisma.downloadAccess.updateMany({ data: { createdAt: new Date(Date.now() - 11 * 60_000) } });
    await h.http().post("/v1/public/downloads/resend").send({ email: "reader@example.com" });
    expect(await prisma.emailOutbox.count({ where: { template: "product_ready", to: "reader@example.com" } })).toBe(before + 1);

    const unknown = await h.http().post("/v1/public/downloads/resend").send({ email: "nobody@example.com" });
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual({ status: "queued" });
  });

  it("stops working after it expires or the purchase is refunded", async () => {
    const fresh = await buy("second@example.com");
    await prisma.downloadAccess.updateMany({ where: { tokenHash: { not: "" }, entitlement: { user: { email: "second@example.com" } } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await h.http().get(`/v1/public/downloads/${fresh.token}`);
    expect(expired.status).toBe(410);
    expect(expired.body.error.code).toBe("LINK_EXPIRED");

    await prisma.entitlement.updateMany({ where: { user: { email: "reader@example.com" } }, data: { status: "REFUNDED" } });
    expect((await h.http().get(`/v1/public/downloads/${token}`)).status).toBe(404);
    expect((await h.http().get("/v1/public/downloads/not-a-real-token")).status).toBe(404);
  });
});
