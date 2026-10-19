import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Queue, Worker } from "bullmq";
import { EmailRelay } from "./common/email";
import { QUEUES } from "./common/queue";
import { env } from "./config/env";
import { FulfillmentService } from "./modules/pay/fulfillment.service";
import { PayModule } from "./modules/pay/pay.module";
import { PayoutEventsProcessor } from "./modules/pay/payout-events.processor";
import { StripeEventsProcessor } from "./modules/pay/stripe-events.processor";
import { runReleaseFunds, SCHEDULES } from "./modules/scheduler.service";

/**
 * Background worker (QUEUE_DRIVER=bullmq): same domain services as the API, no HTTP server.
 * Run one or more replicas: `node dist/worker.js`. Jobs are at-least-once; handlers are idempotent.
 */
@Module({ imports: [PayModule] })
class WorkerModule {}

const MAINTENANCE = "maintenance";

async function main() {
  const log = new Logger("Worker");
  const cfg = env();
  const connection = { url: cfg.REDIS_URL };
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const stripe = app.get(StripeEventsProcessor);
  const payouts = app.get(PayoutEventsProcessor);
  const fulfillment = app.get(FulfillmentService);
  const email = app.get(EmailRelay);

  const workers = [
    new Worker(QUEUES.stripeEvents, (job) => stripe.handle(job.data.id), { connection, concurrency: 8 }),
    new Worker(QUEUES.payoutEvents, (job) => payouts.handle(job.data.id), { connection, concurrency: 4 }),
    new Worker(
      MAINTENANCE,
      async (job) => {
        if (job.name === "release-funds") await runReleaseFunds(fulfillment, log);
        if (job.name === "email-relay") await email.relayBatch(100);
      },
      { connection, concurrency: 1 },
    ),
  ];
  for (const w of workers) w.on("failed", (job, err) => log.error(`${w.name}:${job?.id} attempt ${job?.attemptsMade} failed: ${err.message}`));

  const maintenance = new Queue(MAINTENANCE, { connection });
  await maintenance.upsertJobScheduler("release-funds", { every: SCHEDULES.releaseFundsMs }, { name: "release-funds" });
  await maintenance.upsertJobScheduler("email-relay", { every: SCHEDULES.emailRelayMs }, { name: "email-relay" });
  log.log("worker started");

  const shutdown = async () => {
    await Promise.all(workers.map((w) => w.close()));
    await maintenance.close();
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
