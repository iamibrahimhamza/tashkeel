/**
 * Tenant isolation. Every `:workspaceId` route is discovered from the live router, so a new
 * route that forgets @RequirePermission fails here instead of leaking another expert's data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./harness";

let h: Harness;
let alpha: { token: string; id: string };
let beta: { token: string; id: string };

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
let seq = 0;
const key = () => `iso-${Date.now()}-${++seq}`;

async function expert(email: string, slug: string) {
  const token = (await h.http().post("/v1/auth/signup").send({ name: "خبير", email, password: "correct-horse-battery" })).body.accessToken as string;
  const ws = await h.http().post("/v1/workspaces").set(auth(token)).set("Idempotency-Key", key()).send({ name: slug, slug, timezone: "Asia/Riyadh", country: "SA" });
  expect(ws.status).toBe(201);
  return { token, id: ws.body.id as string };
}

type Route = { method: "get" | "post" | "put" | "patch" | "delete"; path: string };
const call = (r: Route, path: string) => h.http()[r.method](path);

/** Reads registered routes off the Express 5 router. */
function workspaceRoutes(): Route[] {
  const express = h.app.getHttpAdapter().getInstance() as { router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] } };
  const out: Route[] = [];
  for (const layer of express.router.stack) {
    if (!layer.route || !layer.route.path.includes(":workspaceId")) continue;
    for (const [method, on] of Object.entries(layer.route.methods)) if (on && method !== "_all") out.push({ method: method as Route["method"], path: layer.route.path });
  }
  return out;
}

beforeAll(async () => {
  h = await startHarness(54333);
  alpha = await expert("alpha@example.com", "alpha");
  beta = await expert("beta@example.com", "beta");
});
afterAll(async () => {
  await h?.close();
});

describe("tenant isolation", () => {
  it("discovers the workspace-scoped routes", () => {
    // Guards against the discovery silently returning nothing after a framework upgrade.
    expect(workspaceRoutes().length).toBeGreaterThanOrEqual(25);
  });

  it("answers 404 on every workspace route when the caller is not a member", async () => {
    const leaks: string[] = [];
    for (const r of workspaceRoutes()) {
      const path = r.path.replace(":workspaceId", alpha.id).replace(/:[A-Za-z]+/g, "does-not-exist");
      const res = await call(r, path)
        .set(auth(beta.token))
        .set("Idempotency-Key", key())
        .send({});
      if (res.status !== 404 || res.body?.error?.code !== "NOT_FOUND") leaks.push(`${r.method.toUpperCase()} ${r.path} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it("answers 401 on every workspace route without a token", async () => {
    const open: string[] = [];
    for (const r of workspaceRoutes()) {
      const path = r.path.replace(":workspaceId", alpha.id).replace(/:[A-Za-z]+/g, "x");
      const res = await call(r, path).send({});
      if (res.status !== 401) open.push(`${r.method.toUpperCase()} ${r.path} → ${res.status}`);
    }
    expect(open).toEqual([]);
  });

  it("refuses to touch another workspace's records through the caller's own workspace", async () => {
    const service = await h.http().post(`/v1/workspaces/${alpha.id}/services`).set(auth(alpha.token)).send({ title: "جلسة", durationMin: 30, priceMinor: "5000" });
    expect(service.status).toBe(201);
    const patched = await h.http().patch(`/v1/workspaces/${beta.id}/services/${service.body.id}`).set(auth(beta.token)).send({ title: "مسروقة" });
    expect(patched.status).toBe(404);
    const after = await h.http().get(`/v1/workspaces/${alpha.id}/services`).set(auth(alpha.token));
    expect(after.body.data[0].title).toBe("جلسة");

    const versions = await h.http().get(`/v1/workspaces/${alpha.id}/pages/home/versions`).set(auth(alpha.token));
    const versionId = versions.body.data[0].id as string;
    expect((await h.http().get(`/v1/workspaces/${beta.id}/pages/home/versions/${versionId}`).set(auth(beta.token))).status).toBe(404);
    const publish = await h.http().post(`/v1/workspaces/${beta.id}/pages/home/publish`).set(auth(beta.token)).set("Idempotency-Key", key()).send({ versionId });
    expect(publish.status).toBe(404);

    const profile = await h.http().post(`/v1/workspaces/${alpha.id}/payout-profiles`).set(auth(alpha.token))
      .send({ label: "شام كاش", details: { method: "SHAM_CASH", fullName: "خبير ألفا", walletId: "SC11223344", phone: "+963933000001" } });
    expect(profile.status).toBe(201);
    const payout = await h.http().post(`/v1/workspaces/${beta.id}/payouts`).set(auth(beta.token)).set("Idempotency-Key", key())
      .send({ profileId: profile.body.id, amountMinor: "2000", currency: "USD" });
    expect(payout.status).toBe(404);
    expect(JSON.stringify((await h.http().get(`/v1/workspaces/${beta.id}/payout-profiles`).set(auth(beta.token))).body)).not.toContain(profile.body.id);
  });
});
