import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@tashkeel/db";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../common/prisma.service";
import { JOB_QUEUE, type JobQueue, type QueueName } from "../../common/queue";

/**
 * The single entry point for payment events, whichever gateway produced them: persist once
 * (unique provider + eventId), then queue for processing. Stripe webhooks, payout-rail
 * callbacks and the sandbox all go through here, so they share one processing pipeline.
 */
@Injectable()
export class WebhookIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async intake(provider: string, eventId: string, type: string, payload: Prisma.InputJsonValue, queue: QueueName) {
    const rows = await this.prisma.db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "WebhookEvent" (id, provider, "eventId", type, payload, status, attempts, "receivedAt")
      VALUES (${randomUUID()}, ${provider}, ${eventId}, ${type}, ${JSON.stringify(payload)}::jsonb, 'RECEIVED', 0, now())
      ON CONFLICT (provider, "eventId") DO NOTHING
      RETURNING id`;
    let id = rows[0]?.id;
    if (!id) {
      const existing = await this.prisma.db.webhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider, eventId } } });
      if (existing.status === "PROCESSED") return { received: true, duplicate: true };
      id = existing.id; // redelivery of an event that has not succeeded yet: try again
    }
    await this.queue.enqueue(queue, `${provider}:${eventId}`, { id });
    return { received: true };
  }
}
