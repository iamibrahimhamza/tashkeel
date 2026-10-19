import { Injectable } from "@nestjs/common";
import { PayoutProviderEvent } from "@tashkeel/contracts";
import { PrismaService } from "../../common/prisma.service";
import { PayoutsService } from "./payouts.service";

/** Applies status callbacks from alternative payout rails through the same state machine staff use. */
@Injectable()
export class PayoutEventsProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payouts: PayoutsService,
  ) {}

  async handle(webhookEventId: string): Promise<void> {
    const db = this.prisma.db;
    const row = await db.webhookEvent.update({ where: { id: webhookEventId }, data: { attempts: { increment: 1 } } });
    if (row.status === "PROCESSED") return;
    try {
      const e = PayoutProviderEvent.parse(row.payload);
      const payout = await db.payout.findUnique({ where: { id: e.payoutId }, select: { id: true, method: true } });
      // The callback must come from the rail the payout was sent on.
      if (!payout || `payout:${payout.method}` !== row.provider) throw new Error(`payout ${e.payoutId} does not belong to ${row.provider}`);
      await this.payouts.transition(payout.id, e.status, {
        actorId: null,
        ...(e.providerRef ? { providerRef: e.providerRef } : {}),
        ...(e.reason ? { reason: e.reason } : {}),
        note: `provider event ${e.eventId}`,
      });
      await db.webhookEvent.update({ where: { id: row.id }, data: { status: "PROCESSED", processedAt: new Date(), lastError: null } });
    } catch (err) {
      await db.webhookEvent.update({ where: { id: row.id }, data: { status: "FAILED", lastError: (err instanceof Error ? err.message : String(err)).slice(0, 2000) } });
      throw err;
    }
  }
}
