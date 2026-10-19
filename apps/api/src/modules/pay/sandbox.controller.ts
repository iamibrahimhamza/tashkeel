import { Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SandboxDecisionInput, SandboxRefundInput } from "@tashkeel/contracts";
import { can } from "@tashkeel/core";
import type { z } from "zod";
import { CurrentUser, Public, StaffOnly, type AuthUser } from "../../common/auth";
import { DomainError, Errors } from "../../common/errors";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody } from "../../common/zod";
import { env } from "../../config/env";
import { planForPrice } from "./billing.service";
import { PAYMENT_GATEWAY, type PaymentGatewayAdapter } from "./gateway";
import { SandboxGatewayAdapter } from "./sandbox-gateway.adapter";

/**
 * The sandbox "card processor" UI backend. Every route 404s unless the sandbox gateway is the
 * active one, so none of this exists on a server connected to Stripe.
 */
@Controller("v1/sandbox")
export class SandboxController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayAdapter,
  ) {}

  private sandbox(): SandboxGatewayAdapter {
    if (!(this.gateway instanceof SandboxGatewayAdapter)) throw new DomainError("NOT_FOUND", 404, "Not found");
    return this.gateway;
  }

  /** What the approval screen shows. Session ids are unguessable. */
  @Public()
  @Get("sessions/:sessionId")
  async session(@Param("sessionId") sessionId: string) {
    this.sandbox();
    const sub = SandboxGatewayAdapter.decodeSubscription(sessionId);
    if (sub) {
      const plan = await planForPrice(this.prisma, sub.priceId);
      const ws = await this.prisma.db.workspace.findUnique({ where: { id: sub.workspaceId }, select: { name: true } });
      if (!plan || !ws) throw Errors.notFound("Session");
      return { kind: "subscription" as const, sessionId, status: "OPEN", workspace: { name: ws.name, slug: null }, currency: plan.currency, amountMinor: plan.monthlyMinor.toString(), items: [{ title: `${plan.nameAr} · ${plan.name}` }] };
    }
    const order = await this.prisma.db.order.findUnique({
      where: { stripeCheckoutSessionId: sessionId },
      include: { items: { select: { title: true } }, workspace: { select: { name: true, slug: true } } },
    });
    if (!order) throw Errors.notFound("Session");
    return {
      kind: "payment" as const,
      sessionId,
      status: order.status,
      workspace: order.workspace,
      currency: order.currency,
      amountMinor: order.subtotalMinor.toString(),
      items: order.items,
    };
  }

  /** The buyer's decision on the approval screen. Returns where the browser goes next. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post("sessions/:sessionId/decision")
  async decide(@Param("sessionId") sessionId: string, @ValidBody(SandboxDecisionInput) input: z.infer<typeof SandboxDecisionInput>) {
    const sandbox = this.sandbox();
    const order = await this.prisma.db.order.findUnique({ where: { stripeCheckoutSessionId: sessionId }, include: { workspace: { select: { slug: true } } } });
    if (!order) throw Errors.notFound("Session");
    if (order.status !== "PENDING") throw Errors.conflict("This checkout is already closed", "تم إغلاق عملية الدفع هذه");
    const web = env().WEB_URL;
    if (input.decision === "approve") {
      await sandbox.approveCheckout(sessionId, order.id);
      return { redirectUrl: `${web}/${order.workspace.slug}/checkout/success?order=${order.id}` };
    }
    await sandbox.declineCheckout(sessionId, order.id);
    return { redirectUrl: `${web}/${order.workspace.slug}` };
  }

  /** Subscription upgrades are approved by a workspace owner/admin with billing rights. */
  @HttpCode(200)
  @Post("subscriptions/:sessionId/decision")
  async decideSubscription(@CurrentUser() user: AuthUser, @Param("sessionId") sessionId: string, @ValidBody(SandboxDecisionInput) input: z.infer<typeof SandboxDecisionInput>) {
    const sandbox = this.sandbox();
    const sub = SandboxGatewayAdapter.decodeSubscription(sessionId);
    if (!sub) throw Errors.notFound("Session");
    const m = await this.prisma.db.membership.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId: sub.workspaceId } } });
    if (!m || !can(m.role, "billing:manage")) throw Errors.forbidden();
    if (input.decision === "approve") await sandbox.activateSubscription(sessionId);
    return { redirectUrl: `${env().WEB_URL}/dashboard/${sub.workspaceId}/billing` };
  }

  /** Staff can simulate a processor refund to exercise the refund pipeline. */
  @StaffOnly()
  @HttpCode(202)
  @Post("orders/:orderId/refund")
  async refund(@Param("orderId") orderId: string, @ValidBody(SandboxRefundInput) input: z.infer<typeof SandboxRefundInput>) {
    const sandbox = this.sandbox();
    const order = await this.prisma.db.order.findUnique({ where: { id: orderId }, select: { id: true, refundedMinor: true, subtotalMinor: true } });
    if (!order) throw Errors.notFound("Order");
    const total = order.refundedMinor + BigInt(input.amountMinor);
    if (total > order.subtotalMinor) throw new DomainError("VALIDATION_ERROR", 422, "Refund exceeds the amount paid", "مبلغ الاسترداد أكبر من المدفوع");
    await sandbox.refund(order.id, total);
    return { status: "queued" };
  }
}
