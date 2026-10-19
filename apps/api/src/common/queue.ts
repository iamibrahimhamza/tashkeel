import { Logger } from "@nestjs/common";

/**
 * Background job contract. Jobs are delivered at least once, so every handler must be
 * idempotent (they are: each one re-reads state and relies on DB uniqueness).
 */
export const QUEUES = {
  stripeEvents: "stripe-events",
  payoutEvents: "payout-events",
  emails: "emails",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type JobHandler = (data: { id: string }) => Promise<void>;

export interface JobQueue {
  /** `jobId` dedupes enqueues of the same intent (e.g. the webhook event id). */
  enqueue(queue: QueueName, jobId: string, data: { id: string }): Promise<void>;
  register(queue: QueueName, handler: JobHandler): void;
}

export const JOB_QUEUE = Symbol("JOB_QUEUE");

/**
 * Runs jobs in-process right after the request finishes — for development and tests, where
 * Redis may not exist. Failures are logged; the stored WebhookEvent stays FAILED for replay.
 */
export class InlineQueue implements JobQueue {
  private readonly log = new Logger("InlineQueue");
  private readonly handlers = new Map<QueueName, JobHandler>();
  private readonly pending = new Set<Promise<void>>();

  register(queue: QueueName, handler: JobHandler) {
    this.handlers.set(queue, handler);
  }

  async enqueue(queue: QueueName, jobId: string, data: { id: string }) {
    const handler = this.handlers.get(queue);
    if (!handler) throw new Error(`no handler registered for ${queue}`);
    const p = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => handler(data))
      .catch((e: unknown) => this.log.error(`${queue}:${jobId} failed: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  /** Test helper: wait until every queued job has settled. */
  async drain() {
    while (this.pending.size) await Promise.all([...this.pending]);
  }
}

/** Redis-backed queue; processing happens in the worker process (src/worker.ts). */
export class BullQueue implements JobQueue {
  private readonly queues = new Map<QueueName, import("bullmq").Queue>();

  constructor(private readonly redisUrl: string) {}

  register() {
    // Handlers live in the worker process.
  }

  async enqueue(queue: QueueName, jobId: string, data: { id: string }) {
    let q = this.queues.get(queue);
    if (!q) {
      const { Queue } = await import("bullmq");
      q = new Queue(queue, {
        connection: { url: this.redisUrl },
        defaultJobOptions: { attempts: 8, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: 1000, removeOnFail: false },
      });
      this.queues.set(queue, q);
    }
    await q.add(queue, data, { jobId: `${queue}:${jobId}` });
  }
}
