/**
 * Applies the real migration SQL to an in-process Postgres (PGlite) and proves the
 * database-level guarantees: no overlapping bookings, balanced + append-only ledger.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = join(__dirname, "../prisma/migrations");
let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { btree_gist, citext } });
  for (const m of readdirSync(dir).filter((d) => !d.endsWith(".toml")).sort()) {
    await db.exec(readFileSync(join(dir, m, "migration.sql"), "utf8"));
  }
  await db.exec(`
    INSERT INTO "User" (id, email, "updatedAt") VALUES ('u1', 'Sara@Example.com', now()), ('c1', 'client@example.com', now());
    INSERT INTO "Workspace" (id, slug, name, "updatedAt") VALUES ('w1', 'sara', 'Sara', now());
    INSERT INTO "Service" (id, "workspaceId", title, "durationMin", "priceMinor", "updatedAt") VALUES ('s1', 'w1', 'Session', 60, 10000, now());
  `);
}, 60_000);

const booking = (id: string, start: string, end: string, status = "PENDING_PAYMENT") =>
  db.query(
    `INSERT INTO "Booking" (id, "workspaceId", "serviceId", "customerId", "startsAt", "endsAt", "blockStartsAt", "blockEndsAt", "customerTz", status, "updatedAt")
     VALUES ($1, 'w1', 's1', 'c1', $2, $3, $2, $3, 'UTC', $4::"BookingStatus", now())`,
    [id, start, end, status],
  );

describe("database guarantees", () => {
  it("citext makes emails and slugs case-insensitive unique", async () => {
    await expect(db.query(`INSERT INTO "User" (id, email, "updatedAt") VALUES ('u2', 'sara@example.com', now())`)).rejects.toThrow(/unique/i);
  });

  it("rejects overlapping live bookings for the same expert", async () => {
    await booking("b1", "2026-10-20T06:00:00Z", "2026-10-20T07:00:00Z");
    await expect(booking("b2", "2026-10-20T06:30:00Z", "2026-10-20T07:30:00Z")).rejects.toThrow(/booking_no_overlap/);
    // Adjacent is fine ([) ranges).
    await booking("b3", "2026-10-20T07:00:00Z", "2026-10-20T08:00:00Z");
  });

  it("frees the slot once a booking is cancelled", async () => {
    await db.query(`UPDATE "Booking" SET status = 'CANCELLED' WHERE id = 'b1'`);
    await booking("b4", "2026-10-20T06:00:00Z", "2026-10-20T07:00:00Z");
  });

  it("only commits balanced ledger transactions and forbids edits", async () => {
    await db.exec(`
      INSERT INTO "LedgerAccount" (id, owner, "workspaceId", type, currency) VALUES
        ('a_cf', 'PLATFORM', NULL, 'CUSTOMER_FUNDS', 'USD'),
        ('a_rev', 'PLATFORM', NULL, 'PLATFORM_REVENUE', 'USD'),
        ('a_pen', 'WORKSPACE', 'w1', 'EXPERT_PENDING', 'USD');
    `);

    await db.transaction(async (tx) => {
      await tx.exec(`INSERT INTO "LedgerTransaction" (id, kind, "refType", "refId") VALUES ('t1', 'ORDER_PAID', 'order', 'o1')`);
      await tx.exec(`INSERT INTO "LedgerEntry" (id, "transactionId", "accountId", "amountMinor") VALUES
        ('e1', 't1', 'a_cf', 9680), ('e2', 't1', 'a_rev', -800), ('e3', 't1', 'a_pen', -8880)`);
    });

    await expect(
      db.transaction(async (tx) => {
        await tx.exec(`INSERT INTO "LedgerTransaction" (id, kind, "refType", "refId") VALUES ('t2', 'ORDER_PAID', 'order', 'o2')`);
        await tx.exec(`INSERT INTO "LedgerEntry" (id, "transactionId", "accountId", "amountMinor") VALUES ('e4', 't2', 'a_cf', 100)`);
      }),
    ).rejects.toThrow(/unbalanced/);

    // Re-posting the same business event is rejected by (kind, refId).
    await expect(db.exec(`INSERT INTO "LedgerTransaction" (id, kind, "refType", "refId") VALUES ('t3', 'ORDER_PAID', 'order', 'o1')`)).rejects.toThrow(/unique/i);

    await expect(db.exec(`UPDATE "LedgerEntry" SET "amountMinor" = 0 WHERE id = 'e1'`)).rejects.toThrow(/append-only/);
  });

  it("keeps platform ledger accounts unique despite NULL workspaceId", async () => {
    await expect(db.exec(`INSERT INTO "LedgerAccount" (id, owner, "workspaceId", type, currency) VALUES ('dup', 'PLATFORM', NULL, 'CUSTOMER_FUNDS', 'USD')`)).rejects.toThrow(/unique/i);
  });
});
