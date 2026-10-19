/**
 * Boots the real Nest app against an in-process Postgres (PGlite over the wire protocol),
 * with the real migration SQL applied. No Docker needed.
 */
import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(__dirname, "../../../packages/db/prisma/migrations");

export const TEST_SECRETS = {
  stripeWebhook: "whsec_test_secret",
  payoutWebhook: "payout-webhook-test-secret",
  payoutKey: randomBytes(32).toString("base64"),
};

export interface Harness {
  app: INestApplication;
  http: () => import("supertest").Agent;
  close: () => Promise<void>;
}

export type ProviderOverride = { provide: symbol | string; useValue: unknown };

export async function startHarness(port: number, overrides: ProviderOverride[] = []): Promise<Harness> {
  // PGlite ships as ESM only, so it is loaded dynamically from this CommonJS package.
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { citext } = await import("@electric-sql/pglite/contrib/citext");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const pg = await PGlite.create({ extensions: { btree_gist, citext } });
  for (const m of readdirSync(MIGRATIONS).filter((d) => !d.endsWith(".toml")).sort()) {
    await pg.exec(readFileSync(join(MIGRATIONS, m, "migration.sql"), "utf8"));
  }
  await pg.exec(`
    INSERT INTO "Theme" (id, name, "nameAr", "isDefault", tokens) VALUES ('editorial-sand', 'Editorial Sand', 'رملي', true,
      '{"colors":{"ink":"#19221E","paper":"#FAF8F6","sand":"#F3EFEA","accent":"#A98B4C","accentSoft":"#D4B87B","muted":"#6B6F69"},"fonts":{"display":"kufam","body":"plex"},"radius":"soft","mode":"light"}');
    INSERT INTO "Plan" (code, name, "nameAr", "monthlyMinor", "feeBps", "feeFixedMinor", "stripePriceId") VALUES
      ('FREE', 'Starter', 'البداية', 0, 800, 0, NULL),
      ('PRO', 'Pro', 'المحترف', 2900, 400, 0, 'price_pro'),
      ('BUSINESS', 'Business', 'الأعمال', 7900, 150, 0, 'price_business');
  `);

  const server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1" });
  await server.start();

  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?connection_limit=1&sslmode=disable&pgbouncer=true`,
    AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
    STRIPE_WEBHOOK_SECRET: TEST_SECRETS.stripeWebhook,
    PAYOUT_WEBHOOK_SECRET: TEST_SECRETS.payoutWebhook,
    PAYOUT_ENCRYPTION_KEY: TEST_SECRETS.payoutKey,
    QUEUE_DRIVER: "inline",
    FUNDS_HOLD_DAYS: "7",
  });
  // The Prisma client is a process-wide singleton; drop any instance bound to an earlier test DB.
  delete (globalThis as { __tashkeelPrisma?: unknown }).__tashkeelPrisma;

  const { AppModule } = await import("../src/app.module.js");
  const { configureApp } = await import("../src/main.js");
  const { Test } = await import("@nestjs/testing");
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const o of overrides) builder = builder.overrideProvider(o.provide).useValue(o.useValue);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true, logger: process.env.DEBUG_API ? undefined : false });
  configureApp(app);
  await app.init();

  const supertest = (await import("supertest")).default;
  return {
    app,
    http: () => supertest.agent(app.getHttpServer()),
    close: async () => {
      await app.close();
      await server.stop();
      await pg.close();
    },
  };
}
