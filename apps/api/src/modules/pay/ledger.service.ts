import { Injectable } from "@nestjs/common";
import { ledger, type JournalEntry, type LedgerAccountType } from "@tashkeel/core";
import type { Tx } from "@tashkeel/db";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../common/prisma.service";

export interface BalanceSnapshot {
  pending: bigint;
  available: bigint;
  inTransit: bigint;
}

/**
 * Writes balanced journal entries. Posting is idempotent per (kind, refId): the insert uses
 * ON CONFLICT DO NOTHING, so a redelivered event cannot double-post, and the enclosing
 * transaction is never aborted by a unique violation.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns false when this business event was already posted. Must run inside `tx`. */
  async post(tx: Tx, entry: JournalEntry, scope: { workspaceId: string; currency: string }): Promise<boolean> {
    const checked = ledger.assertBalanced(entry);
    const txId = randomUUID();
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "LedgerTransaction" (id, kind, "refType", "refId", memo, "createdAt")
      VALUES (${txId}, ${checked.kind}, ${checked.refType}, ${checked.refId}, ${checked.memo ?? null}, now())
      ON CONFLICT (kind, "refId") DO NOTHING
      RETURNING id`;
    if (!inserted.length) return false;

    for (const p of checked.postings) {
      const accountId = await this.accountId(tx, p.account.owner, p.account.type, scope);
      await tx.ledgerEntry.create({
        data: { transactionId: txId, accountId, amountMinor: p.amountMinor, availableAt: p.availableAt ?? null },
      });
    }
    return true;
  }

  async hasPosted(tx: Tx, kind: string, refId: string): Promise<boolean> {
    return !!(await tx.ledgerTransaction.findUnique({ where: { kind_refId: { kind, refId } }, select: { id: true } }));
  }

  /**
   * Locks the workspace's AVAILABLE account row (FOR UPDATE) so concurrent payout requests
   * are serialized and cannot overdraw.
   */
  async lockAvailable(tx: Tx, workspaceId: string, currency: string): Promise<void> {
    const id = await this.accountId(tx, "WORKSPACE", "EXPERT_AVAILABLE", { workspaceId, currency });
    await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${id} FOR UPDATE`;
  }

  async balance(db: Tx | PrismaService["db"], workspaceId: string, currency: string): Promise<BalanceSnapshot> {
    const rows = await db.$queryRaw<Array<{ type: LedgerAccountType; total: bigint | null }>>`
      SELECT a.type, SUM(e."amountMinor")::bigint AS total
      FROM "LedgerAccount" a JOIN "LedgerEntry" e ON e."accountId" = a.id
      WHERE a."workspaceId" = ${workspaceId} AND a.currency = ${currency}
      GROUP BY a.type`;
    const raw = (t: LedgerAccountType) => rows.find((r) => r.type === t)?.total ?? 0n;
    return {
      pending: ledger.displayBalance("EXPERT_PENDING", raw("EXPERT_PENDING")),
      available: ledger.displayBalance("EXPERT_AVAILABLE", raw("EXPERT_AVAILABLE")),
      inTransit: ledger.displayBalance("PAYOUTS_IN_TRANSIT", raw("PAYOUTS_IN_TRANSIT")),
    };
  }

  private async accountId(tx: Tx, owner: "PLATFORM" | "WORKSPACE", type: LedgerAccountType, scope: { workspaceId: string; currency: string }) {
    const workspaceId = owner === "WORKSPACE" ? scope.workspaceId : null;
    const where = { owner, type, currency: scope.currency, workspaceId };
    const found = await tx.ledgerAccount.findFirst({ where, select: { id: true } });
    if (found) return found.id;
    // Created lazily (e.g. first sale in a new currency). ON CONFLICT keeps this safe under races.
    const id = randomUUID();
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "LedgerAccount" (id, owner, "workspaceId", type, currency)
      VALUES (${id}, ${owner}::"LedgerOwner", ${workspaceId}, ${type}::"LedgerAccountType", ${scope.currency})
      ON CONFLICT DO NOTHING
      RETURNING id`;
    if (rows[0]) return rows[0].id;
    const again = await tx.ledgerAccount.findFirst({ where, select: { id: true } });
    if (!again) throw new Error(`ledger account ${owner}/${type}/${scope.currency} could not be resolved`);
    return again.id;
  }
}

