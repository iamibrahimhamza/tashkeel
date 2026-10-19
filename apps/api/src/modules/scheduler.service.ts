import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { EmailRelay } from "../common/email";
import { env } from "../config/env";
import { HoldsService } from "./booking/holds.service";
import { FulfillmentService } from "./pay/fulfillment.service";

/**
 * Periodic jobs. Each is idempotent and safe to run concurrently from several processes.
 *  - release-funds: hourly-ish, moves matured earnings to AVAILABLE
 *  - email-relay: drains the transactional outbox
 *  - expire-holds: releases booking slots whose 10-minute payment hold lapsed
 * With QUEUE_DRIVER=bullmq these run as repeatable jobs in the worker instead (src/worker.ts).
 */
export const SCHEDULES = {
  releaseFundsMs: 15 * 60_000,
  emailRelayMs: 30_000,
  expireHoldsMs: 60_000,
};

export async function runReleaseFunds(f: FulfillmentService, log: Logger) {
  const n = await f.releaseDueFunds();
  if (n) log.log(`released funds for ${n} order(s)`);
}

@Injectable()
export class InlineScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger("Scheduler");
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly fulfillment: FulfillmentService,
    private readonly email: EmailRelay,
    private readonly holds: HoldsService,
  ) {}

  onApplicationBootstrap() {
    const cfg = env();
    if (cfg.QUEUE_DRIVER !== "inline" || cfg.NODE_ENV === "test") return;
    const every = (ms: number, name: string, fn: () => Promise<unknown>) =>
      this.timers.push(setInterval(() => fn().catch((e: unknown) => this.log.error(`${name}: ${String(e)}`)), ms).unref());
    every(SCHEDULES.releaseFundsMs, "release-funds", () => runReleaseFunds(this.fulfillment, this.log));
    every(SCHEDULES.emailRelayMs, "email-relay", () => this.email.relayBatch());
    every(SCHEDULES.expireHoldsMs, "expire-holds", () => this.holds.expireDue());
  }

  onApplicationShutdown() {
    this.timers.forEach(clearInterval);
  }
}
