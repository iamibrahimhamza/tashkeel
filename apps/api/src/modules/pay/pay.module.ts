import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { EmailRelay } from "../../common/email";
import { PrismaService } from "../../common/prisma.service";
import { BullQueue, InlineQueue, JOB_QUEUE, QUEUES, type JobQueue } from "../../common/queue";
import { env } from "../../config/env";
import { AdminPayController } from "./admin.controller";
import { BillingService } from "./billing.service";
import { CheckoutController } from "./checkout.controller";
import { FinanceController } from "./finance.controller";
import { FulfillmentService } from "./fulfillment.service";
import { LedgerService } from "./ledger.service";
import { gatewayMode, PAYMENT_GATEWAY, StripeGatewayAdapter, type PaymentGatewayAdapter } from "./gateway";
import { SandboxController } from "./sandbox.controller";
import { SandboxGatewayAdapter } from "./sandbox-gateway.adapter";
import { WebhookIntakeService } from "./webhook-intake.service";
import { RecordsController } from "./records.controller";
import { PayoutEventsProcessor } from "./payout-events.processor";
import { PayoutsService } from "./payouts.service";
import { StripeEventsProcessor } from "./stripe-events.processor";
import { WebhooksController } from "./webhooks.controller";

/** Tashkeel Pay: checkout, webhooks, ledger, balances, payouts, subscriptions. */
@Module({
  controllers: [CheckoutController, WebhooksController, FinanceController, AdminPayController, SandboxController, RecordsController],
  providers: [
    PrismaService,
    LedgerService,
    FulfillmentService,
    BillingService,
    PayoutsService,
    StripeEventsProcessor,
    PayoutEventsProcessor,
    EmailRelay,
    WebhookIntakeService,
    StripeGatewayAdapter,
    SandboxGatewayAdapter,
    {
      // Stripe when STRIPE_SECRET_KEY is a real key; the local sandbox when it is empty or "mock".
      provide: PAYMENT_GATEWAY,
      useFactory: (stripe: StripeGatewayAdapter, sandbox: SandboxGatewayAdapter): PaymentGatewayAdapter => (gatewayMode() === "stripe" ? stripe : sandbox),
      inject: [StripeGatewayAdapter, SandboxGatewayAdapter],
    },
    {
      provide: JOB_QUEUE,
      useFactory: (): JobQueue => (env().QUEUE_DRIVER === "bullmq" ? new BullQueue(env().REDIS_URL) : new InlineQueue()),
    },
  ],
  exports: [FulfillmentService, StripeEventsProcessor, PayoutEventsProcessor, EmailRelay, LedgerService, JOB_QUEUE],
})
export class PayModule implements OnModuleInit {
  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly stripeEvents: StripeEventsProcessor,
    private readonly payoutEvents: PayoutEventsProcessor,
  ) {}

  onModuleInit() {
    // With the inline driver these run in-process; with BullMQ the worker registers the same handlers.
    this.queue.register(QUEUES.stripeEvents, ({ id }) => this.stripeEvents.handle(id));
    this.queue.register(QUEUES.payoutEvents, ({ id }) => this.payoutEvents.handle(id));
  }
}
