#!/usr/bin/env node
/**
 * Zero-install local Postgres for development: PGlite (Postgres compiled to WASM) served over
 * the Postgres wire protocol, persisted in ./.pglite. Use it when Docker isn't available:
 *
 *   pnpm db:local                 # starts on 127.0.0.1:5432 and applies migrations
 *   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres?connection_limit=1&sslmode=disable&pgbouncer=true"
 *
 * It accepts one connection at a time, so set connection_limit=1. Production uses real Postgres.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, ".pglite");
const fresh = !existsSync(dataDir);
const port = Number(process.env.PGPORT ?? 5432);

const db = await PGlite.create(dataDir, { extensions: { btree_gist, citext } });

await db.exec(`CREATE TABLE IF NOT EXISTS _tashkeel_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`);
const migrationsDir = join(root, "prisma/migrations");
for (const name of readdirSync(migrationsDir).filter((d) => !d.endsWith(".toml")).sort()) {
  const done = await db.query(`SELECT 1 FROM _tashkeel_migrations WHERE name = $1`, [name]);
  if (done.rows.length) continue;
  await db.transaction(async (tx) => {
    await tx.exec(readFileSync(join(migrationsDir, name, "migration.sql"), "utf8"));
    await tx.query(`INSERT INTO _tashkeel_migrations (name) VALUES ($1)`, [name]);
  });
  console.log(`applied ${name}`);
}

const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
await server.start();
console.log(`${fresh ? "created" : "opened"} ${dataDir}`);
console.log(`PGlite listening on 127.0.0.1:${port}`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
