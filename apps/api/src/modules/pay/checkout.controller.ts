import { Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CreateCheckoutInput, type CheckoutSession } from "@tashkeel/contracts";
import { computeFees, DEFAULT_PLANS, providerIdempotencyKey } from "@tashkeel/core";
import { Public } from "../../common/auth";
import { DomainError, Errors } from "../../common/errors";
import { Idempotent } from "../../common/idempotency";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody } from "../../common/zod";
import { env } from "../../config/env";
import { FulfillmentService } from "./fulfillment.service";
import { PAYMENT_GATEWAY, type PaymentGatewayAdapter } from "./gateway";

/** Stripe's minimum session lifetime; bookings hold their slot for the same window. */
const SESSION_TTL_MS = 30 * 60_000;

@Controller("v1/checkout")
export class CheckoutController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfillment: FulfillmentService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayAdapter,
  ) {}

  /**
   * Creates an order priced entirely server-side and a hosted checkout for it.
   * Requires Idempotency-Key: a retried click returns the same order and session.
   */
  @Public()
  @Idempotent()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("sessions")
  async create(@ValidBody(CreateCheckoutInput) input: CreateCheckoutInput): Promise<CheckoutSession> {
    const db = this.prisma.db;
    const ws = await db.workspace.findUnique({ where: { slug: input.workspaceSlug } });
    if (!ws) throw Errors.notFound("Workspace");

    let line: { title: string; unitPriceMinor: bigint; currency: string; productId?: string; bookingId?: string; serviceId?: string };
    let cancelPath: string;
    if (input.item.kind === "product") {
      const product = await db.product.findFirst({ where: { id: input.item.productId, workspaceId: ws.id, status: "PUBLISHED" } });
      if (!product) throw Errors.notFound("Product");
      line = { title: product.title, unitPriceMinor: product.priceMinor, currency: product.currency, productId: product.id };
      cancelPath = `/${ws.slug}/p/${product.slug}`;
    } else {
      const booking = await db.booking.findFirst({
        where: { id: input.item.bookingId, workspaceId: ws.id, status: "PENDING_PAYMENT" },
        include: { service: true, orderItem: true },
      });
      if (!booking || (booking.holdExpiresAt && booking.holdExpiresAt <= new Date())) {
        throw new DomainError("SLOT_UNAVAILABLE", 409, "This booking is no longer held", "انتهت مدة حجز هذا الموعد");
      }
      if (booking.orderItem) throw Errors.conflict("Checkout already started for this booking", "بدأت عملية الدفع لهذا الحجز مسبقاً");
      line = { title: booking.service.title, unitPriceMinor: booking.service.priceMinor, currency: booking.service.currency, bookingId: booking.id, serviceId: booking.serviceId };
      cancelPath = `/${ws.slug}`;
    }

    const plan = (await db.plan.findUnique({ where: { code: ws.planCode } })) ?? { ...DEFAULT_PLANS[ws.planCode], code: ws.planCode };
    const fees = computeFees(line.unitPriceMinor, { feeBps: plan.feeBps, feeFixedMinor: plan.feeFixedMinor });

    // Buyers check out as guests; their account is keyed by email and claimed later via magic link.
    const customer = await db.user.upsert({
      where: { email: input.customer.email },
      update: {},
      create: { email: input.customer.email, name: input.customer.name ?? null, locale: input.locale },
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
        locale: input.locale,
        successUrl: `${web}/${ws.slug}/checkout/success?order=${order.id}`,
        cancelUrl: `${web}${cancelPath}`,
        expiresAt,
        idempotencyKey: providerIdempotencyKey.checkoutSession(order.id),
      });
      await db.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.id } });
      if (line.bookingId) await db.booking.update({ where: { id: line.bookingId }, data: { holdExpiresAt: expiresAt } });
      return { orderId: order.id, checkoutUrl: session.url, expiresAt: expiresAt.toISOString(), status: "PENDING" };
    } catch (e) {
      // No session exists for this order; close it so it never shows as pending.
      await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
      throw e;
    }
  }

  /** Minimal, non-sensitive status for the post-checkout page (order ids are unguessable). */
  @Public()
  @Get("orders/:orderId")
  async status(@Param("orderId") orderId: string) {
    const order = await this.prisma.db.order.findUnique({
      where: { id: orderId },
      select: { status: true, currency: true, subtotalMinor: true, items: { select: { title: true, productId: true, bookingId: true } }, workspace: { select: { slug: true, name: true } } },
    });
    if (!order) throw Errors.notFound("Order");
    return {
      status: order.status,
      currency: order.currency,
      amountMinor: order.subtotalMinor.toString(),
      workspace: order.workspace,
      items: order.items.map((i) => ({ title: i.title, kind: i.productId ? "product" : "booking" })),
    };
  }
}
