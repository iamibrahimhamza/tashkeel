import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { PAYMENT_GATEWAY, type PaymentGatewayAdapter } from "./gateway";

const ACTIVE = new Set(["active", "trialing", "past_due"]);

/** Sandbox mode has no Stripe prices yet, so plans are addressed as "sbx_price_<CODE>" there. */
export const sandboxPriceId = (code: string) => `sbx_price_${code}`;

export async function planForPrice(prisma: PrismaService, priceId: string) {
  const code = priceId.startsWith("sbx_price_") ? priceId.slice("sbx_price_".length) : null;
  if (code === "FREE" || code === "PRO" || code === "BUSINESS") return prisma.db.plan.findUnique({ where: { code } });
  return prisma.db.plan.findFirst({ where: { stripePriceId: priceId } });
}

/** SaaS subscription tiers (the "subscription" half of the hybrid revenue model). */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayAdapter,
  ) {}

  /**
   * Re-reads the subscription from the processor instead of trusting the event body, so events
   * that arrive out of order still converge on the processor's current state.
   */
  async syncSubscription(subscriptionId: string): Promise<void> {
    const sub = await this.gateway.retrieveSubscription(subscriptionId);
    const workspaceId = sub.workspaceId;
    if (!workspaceId) throw new Error(`subscription ${sub.id} has no workspaceId metadata`);
    const plan = sub.priceId ? await planForPrice(this.prisma, sub.priceId) : null;
    if (!plan) throw new Error(`subscription ${sub.id} uses unknown price ${sub.priceId}`);

    const isActive = ACTIVE.has(sub.status);
    await this.prisma.db.$transaction([
      this.prisma.db.subscription.upsert({
        where: { workspaceId },
        update: { planCode: plan.code, status: sub.status, stripeSubscriptionId: sub.id, stripeCustomerId: sub.customerId, currentPeriodEnd: sub.currentPeriodEnd },
        create: { workspaceId, planCode: plan.code, status: sub.status, stripeSubscriptionId: sub.id, stripeCustomerId: sub.customerId, currentPeriodEnd: sub.currentPeriodEnd },
      }),
      // The fee schedule follows the plan from the next order on; past orders keep their snapshot.
      this.prisma.db.workspace.update({ where: { id: workspaceId }, data: { planCode: isActive ? plan.code : "FREE" } }),
      this.prisma.db.auditLog.create({ data: { workspaceId, action: "billing.subscription.sync", target: sub.id, data: { status: sub.status, plan: plan.code } } }),
    ]);
  }
}
