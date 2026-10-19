import { Inject, Injectable } from "@nestjs/common";
import type { CheckoutSession } from "@tashkeel/contracts";
import { computeFees, DEFAULT_PLANS, providerIdempotencyKey } from "@tashkeel/core";
import type { Workspace } from "@tashkeel/db";
import { PrismaService } from "../../common/prisma.service";
import { env } from "../../config/env";
import { FulfillmentService } from "./fulfillment.service";
import { PAYMENT_GATEWAY, type PaymentGatewayAdapter } from "./gateway";

/** Stripe's minimum Checkout lifetime. Booking holds are shorter and expire the session themselves. */
const SESSION_TTL_MS = 30 * 60_000;

export type CheckoutLine = {
  title: string;
  unitPriceMinor: bigint;
  currency: string;
  productId?: string;
  bookingId?: string;
  serviceId?: string;
};

/**
 * One path from "this buyer wants this item" to a priced order and a gateway session, shared by
 * product purchases and booking holds. Prices always come from the database, never the client.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfillment: FulfillmentService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayAdapter,
  ) {}

  async start(args: {
    workspace: Workspace;
    line: CheckoutLine;
    customer: { email: string; name?: string | undefined };
    locale: "ar" | "en";
    cancelPath: string;
  }): Promise<CheckoutSession> {
    const { workspace: ws, line } = args;
    const db = this.prisma.db;
    const plan = (await db.plan.findUnique({ where: { code: ws.planCode } })) ?? { ...DEFAULT_PLANS[ws.planCode], code: ws.planCode };
    const fees = computeFees(line.unitPriceMinor, { feeBps: plan.feeBps, feeFixedMinor: plan.feeFixedMinor });

    // Buyers check out as guests; their account is keyed by email and claimed later via magic link.
    const customer = await db.user.upsert({
      where: { email: args.customer.email },
      update: {},
      create: { email: args.customer.email, name: args.customer.name ?? null, locale: args.locale },
    });

    const order = await db.order.create({
      data: {
        workspaceId: ws.id,
        customerId: customer.id,
        currency: line.currency,
        subtotalMinor: fees.grossMinor,
        platformFeeMinor: fees.platformFeeMinor,
        feeBpsSnapshot: plan.feeBps,
        feeFixedSnapshot: plan.feeFixedMinor,
        items: {
          create: {
            title: line.title,
            unitPriceMinor: line.unitPriceMinor,
            productId: line.productId ?? null,
            bookingId: line.bookingId ?? null,
            serviceId: line.serviceId ?? null,
          },
        },
      },
    });

    if (fees.grossMinor === 0n) {
      await this.fulfillment.settlePaid(order.id, { paymentIntentId: null, processorFeeMinor: 0n });
      return { orderId: order.id, checkoutUrl: null, expiresAt: null, status: "PAID" };
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const web = env().WEB_URL;
    try {
      const session = await this.gateway.createCheckoutSession({
        orderId: order.id,
        currency: line.currency,
        lineItems: [{ title: line.title, unitAmountMinor: line.unitPriceMinor, quantity: 1 }],
        customerEmail: customer.email,
        locale: args.locale,
        successUrl: `${web}/${ws.slug}/checkout/success?order=${order.id}`,
        cancelUrl: `${web}${args.cancelPath}`,
        expiresAt,
        idempotencyKey: providerIdempotencyKey.checkoutSession(order.id),
      });
      await db.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.id } });
      return { orderId: order.id, checkoutUrl: session.url, expiresAt: expiresAt.toISOString(), status: "PENDING" };
    } catch (e) {
      // No session exists for this order; close it so it never shows as pending.
      await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
      throw e;
    }
  }
}
