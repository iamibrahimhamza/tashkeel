import { Controller, Get, HttpCode, Inject, Param, Patch, Post } from "@nestjs/common";
import { AdminPayoutsQuery, AdminPayoutTransitionInput, type PaymentSettings } from "@tashkeel/contracts";
import type { z } from "zod";
import { CurrentUser, StaffOnly, SuperAdminOnly, type AuthUser } from "../../common/auth";
import { Errors } from "../../common/errors";
import { PrismaService } from "../../common/prisma.service";
import { JOB_QUEUE, QUEUES, type JobQueue } from "../../common/queue";
import { ValidBody, ValidQuery } from "../../common/zod";
import { env } from "../../config/env";
import { gatewayMode } from "./gateway";
import { payoutDto, PayoutsService } from "./payouts.service";
import { STRIPE_WEBHOOK_EVENTS } from "./stripe-events.processor";

/** Tashkeel staff: the manual-ops payout queue and webhook dead-letter handling. */
@Controller("v1/admin")
@StaffOnly()
export class AdminPayController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payouts: PayoutsService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  @Get("payouts")
  async list(@ValidQuery(AdminPayoutsQuery) q: z.infer<typeof AdminPayoutsQuery>) {
    const rows = await this.prisma.db.payout.findMany({
      where: q.status ? { status: q.status } : { status: { in: ["REQUESTED", "APPROVED", "PROCESSING"] } },
      include: { workspace: { select: { slug: true, name: true, country: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return {
      data: page.map((p) => ({ ...payoutDto(p), workspace: p.workspace })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }

  /** Reveals the destination account so staff can execute the transfer. Every view is audited. */
  @Get("payouts/:payoutId")
  async detail(@CurrentUser() staff: AuthUser, @Param("payoutId") id: string) {
    const p = await this.prisma.db.payout.findUnique({ where: { id }, include: { profile: true, events: { orderBy: { createdAt: "asc" } }, workspace: { select: { slug: true, name: true, country: true } } } });
    if (!p) throw Errors.notFound("Payout");
    await this.prisma.db.auditLog.create({ data: { actorId: staff.id, workspaceId: p.workspaceId, action: "payout.details_viewed", target: p.id } });
    return {
      ...payoutDto(p),
      workspace: p.workspace,
      destination: { label: p.profile.label, details: this.payouts.revealDetails(p.profile) },
      events: p.events.map((e) => ({ from: e.from, to: e.to, actorId: e.actorId, note: e.note, at: e.createdAt.toISOString() })),
    };
  }

  @Patch("payouts/:payoutId")
  async transition(@CurrentUser() staff: AuthUser, @Param("payoutId") id: string, @ValidBody(AdminPayoutTransitionInput) input: AdminPayoutTransitionInput) {
    return this.payouts.transition(id, input.to, {
      actorId: staff.id,
      ...("note" in input && input.note ? { note: input.note } : {}),
      ...("providerRef" in input ? { providerRef: input.providerRef } : {}),
      ...("receiptKey" in input && input.receiptKey ? { receiptKey: input.receiptKey } : {}),
      ...("reason" in input ? { reason: input.reason } : {}),
    });
  }

  @Get("webhooks/failed")
  async failedWebhooks() {
    const rows = await this.prisma.db.webhookEvent.findMany({ where: { status: "FAILED" }, orderBy: { receivedAt: "desc" }, take: 100 });
    return { data: rows.map((w) => ({ id: w.id, provider: w.provider, eventId: w.eventId, type: w.type, attempts: w.attempts, lastError: w.lastError, receivedAt: w.receivedAt.toISOString() })) };
  }

  @HttpCode(202)
  @Post("webhooks/:id/replay")
  async replay(@CurrentUser() staff: AuthUser, @Param("id") id: string) {
    const w = await this.prisma.db.webhookEvent.findUnique({ where: { id } });
    if (!w) throw Errors.notFound("Webhook event");
    if (w.status === "PROCESSED") return { status: "already_processed" };
    await this.prisma.db.auditLog.create({ data: { actorId: staff.id, action: "webhook.replay", target: w.id } });
    await this.queue.enqueue(w.provider === "stripe" ? QUEUES.stripeEvents : QUEUES.payoutEvents, `${w.provider}:${w.eventId}:replay:${Date.now()}`, { id: w.id });
    return { status: "queued" };
  }

  /**
   * How payments are wired, for the Super Admin settings screen: active gateway, which
   * environment keys are present (never their values), and where to point Stripe's webhook.
   */
  @SuperAdminOnly()
  @Get("settings/payments")
  async paymentSettings(): Promise<PaymentSettings> {
    const cfg = env();
    const isSet = (v: string | undefined) => !!v && v !== "mock";
    const plans = await this.prisma.db.plan.findMany({ where: { stripePriceId: null, monthlyMinor: { gt: 0 } }, select: { code: true } });
    return {
      mode: gatewayMode(),
      webhookUrl: `${cfg.API_URL}/v1/webhooks/stripe`,
      webhookEvents: [...STRIPE_WEBHOOK_EVENTS],
      keys: [
        { name: "STRIPE_SECRET_KEY", isSet: isSet(cfg.STRIPE_SECRET_KEY), where: "api", purpose: "Creates Checkout sessions and reads payments and subscriptions" },
        { name: "STRIPE_WEBHOOK_SECRET", isSet: isSet(cfg.STRIPE_WEBHOOK_SECRET), where: "api", purpose: "Verifies that webhook events really come from Stripe" },
        { name: "PAYOUT_ENCRYPTION_KEY", isSet: isSet(cfg.PAYOUT_ENCRYPTION_KEY), where: "api", purpose: "Encrypts experts' payout account details at rest" },
        { name: "PAYOUT_WEBHOOK_SECRET", isSet: isSet(cfg.PAYOUT_WEBHOOK_SECRET), where: "api", purpose: "Verifies status callbacks from payout rails" },
      ],
      plansMissingPriceId: plans.map((p) => p.code),
    };
  }
}
