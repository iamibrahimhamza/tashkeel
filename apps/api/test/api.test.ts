import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./harness";

let h: Harness;
let ownerToken: string;
let workspaceId: string;

beforeAll(async () => {
  h = await startHarness(54329);
});
afterAll(async () => {
  await h?.close();
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function signup(email: string) {
  const res = await h.http().post("/v1/auth/signup").send({ name: "خبير", email, password: "correct-horse-battery" });
  expect(res.status).toBe(201);
  return res.body.accessToken as string;
}

describe("auth", () => {
  it("signs up, logs in, and rejects a wrong password with a uniform error", async () => {
    ownerToken = await signup("Sara@Example.com");
    const ok = await h.http().post("/v1/auth/login").send({ email: "sara@example.com", password: "correct-horse-battery" });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTypeOf("string");

    const bad = await h.http().post("/v1/auth/login").send({ email: "sara@example.com", password: "nope" });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ error: { code: "UNAUTHENTICATED", message: "Email or password is incorrect", messageAr: expect.any(String) } });
  });

  it("returns 422 with field details on invalid input", async () => {
    const res = await h.http().post("/v1/auth/signup").send({ name: "x", email: "not-an-email", password: "short" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });

  it("rejects duplicate emails case-insensitively", async () => {
    const res = await h.http().post("/v1/auth/signup").send({ name: "خبير", email: "SARA@example.com", password: "correct-horse-battery" });
    expect(res.status).toBe(409);
  });

  it("requires a token for private routes", async () => {
    const res = await h.http().get("/v1/workspaces");
    expect(res.status).toBe(401);
  });
});

describe("workspaces + idempotency", () => {
  const body = { name: "د. سارة", slug: "sara", timezone: "Asia/Damascus", country: "SY" };

  it("requires an Idempotency-Key", async () => {
    const res = await h.http().post("/v1/workspaces").set(auth(ownerToken)).send(body);
    expect(res.status).toBe(400);
  });

  it("creates once and replays the same response on retry", async () => {
    const first = await h.http().post("/v1/workspaces").set(auth(ownerToken)).set("Idempotency-Key", "create-ws-0001").send(body);
    expect(first.status).toBe(201);
    workspaceId = first.body.id;

    const retry = await h.http().post("/v1/workspaces").set(auth(ownerToken)).set("Idempotency-Key", "create-ws-0001").send(body);
    expect(retry.status).toBe(201);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(retry.body.id).toBe(workspaceId);
  });

  it("rejects the same key with a different payload", async () => {
    const res = await h.http().post("/v1/workspaces").set(auth(ownerToken)).set("Idempotency-Key", "create-ws-0001").send({ ...body, name: "آخر" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("rejects taken and reserved slugs", async () => {
    const taken = await h.http().post("/v1/workspaces").set(auth(ownerToken)).set("Idempotency-Key", "create-ws-0002").send(body);
    expect(taken.status).toBe(409);
    const avail = await h.http().get("/v1/slugs/admin/availability");
    expect(avail.body).toEqual({ slug: "admin", isAvailable: false });
  });

  it("hides other people's workspaces (404, not 403)", async () => {
    const stranger = await signup("stranger@example.com");
    const res = await h.http().get(`/v1/workspaces/${workspaceId}`).set(auth(stranger));
    expect(res.status).toBe(404);
  });
});

describe("digital home", () => {
  it("serves the starter page publicly right after creation", async () => {
    const res = await h.http().get("/v1/public/homes/sara");
    expect(res.status).toBe(200);
    expect(res.body.workspace).toMatchObject({ slug: "sara", timezone: "Asia/Damascus" });
    expect(res.body.blocks[0]).toMatchObject({ type: "hero", props: { title: "د. سارة" } });
    expect(res.body.theme.colors.accent).toBe("#A98B4C");
  });

  it("keeps serving the published version until the draft is published", async () => {
    const blocks = [{ id: "hero", type: "hero", props: { title: "عنوان جديد" } }];
    const save = await h.http().put(`/v1/workspaces/${workspaceId}/pages/home/draft`).set(auth(ownerToken)).send({ blocks });
    expect(save.status).toBe(200);

    expect((await h.http().get("/v1/public/homes/sara")).body.blocks[0].props.title).toBe("د. سارة");

    const pub = await h.http().post(`/v1/workspaces/${workspaceId}/pages/home/publish`).set(auth(ownerToken));
    expect(pub.status).toBe(200);
    const after = await h.http().get("/v1/public/homes/sara");
    expect(after.body.blocks[0].props).toEqual({ title: "عنوان جديد", layout: "split" });
  });

  it("keeps immutable versions, skips no-op saves, and rolls back by pointer swap", async () => {
    const base = `/v1/workspaces/${workspaceId}/pages/home`;
    const v1 = (await h.http().get(`${base}/versions`).set(auth(ownerToken))).body.data;
    const published = v1.find((v: { isPublished: boolean }) => v.isPublished);
    expect(published).toBeTruthy();

    const blocks = [{ id: "c", type: "courses", props: {} }, { id: "hero", type: "hero", props: { title: "نسخة ثالثة" } }];
    const first = await h.http().put(`${base}/draft`).set(auth(ownerToken)).send({ blocks });
    const same = await h.http().put(`${base}/draft`).set(auth(ownerToken)).send({ blocks });
    expect(same.body).toMatchObject({ versionId: first.body.versionId, unchanged: true });

    const editor = await h.http().get(`/v1/workspaces/${workspaceId}/site`).set(auth(ownerToken));
    expect(editor.body.page).toMatchObject({ hasUnpublishedChanges: true, draftVersionId: first.body.versionId });
    expect(editor.body.page.blocks[0]).toMatchObject({ type: "courses", props: { heading: "الدورات" } });
    expect(editor.body.themes.length).toBeGreaterThan(0);

    await h.http().post(`${base}/publish`).set(auth(ownerToken)).send({});
    expect((await h.http().get("/v1/public/homes/sara")).body.blocks[1].props.title).toBe("نسخة ثالثة");

    // Roll back to the previously published version; the newer version still exists.
    const rb = await h.http().post(`${base}/publish`).set(auth(ownerToken)).send({ versionId: published.id });
    expect(rb.body).toEqual({ publishedVersionId: published.id, slug: "sara" });
    expect((await h.http().get("/v1/public/homes/sara")).body.blocks[0].props.title).toBe("عنوان جديد");
    const old = await h.http().get(`${base}/versions/${first.body.versionId}`).set(auth(ownerToken));
    expect(old.body.blocks).toHaveLength(2);

    expect((await h.http().post(`${base}/publish`).set(auth(ownerToken)).send({ versionId: "nope" })).status).toBe(404);
    const list = (await h.http().get("/v1/public/homes")).body.data;
    expect(list.map((x: { slug: string }) => x.slug)).toContain("sara");
  });

  it("rejects unknown block types", async () => {
    const res = await h.http().put(`/v1/workspaces/${workspaceId}/pages/home/draft`).set(auth(ownerToken)).send({ blocks: [{ id: "x", type: "script", props: {} }] });
    expect(res.status).toBe(422);
  });

  it("404s unknown homes", async () => {
    const res = await h.http().get("/v1/public/homes/nobody");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
