import { Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CreateCheckoutInput, type CheckoutSession } from "@tashkeel/contracts";
import { Public } from "../../common/auth";
import { DomainError, Errors } from "../../common/errors";
import { Idempotent } from "../../common/idempotency";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody } from "../../common/zod";
import { CheckoutService, type CheckoutLine } from "./checkout.service";

@Controller("v1/checkout")
export class CheckoutController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: CheckoutService,
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

    let line: CheckoutLine;
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

    return this.checkout.start({ workspace: ws, line, customer: input.customer, locale: input.locale, cancelPath });
  }

  /** Minimal, non-sensitive status for the post-checkout page (order ids are unguessable). */
  @Public()
  @Get("orders/:orderId")
  async status(@Param("orderId") orderId: string) {
    const order = await this.prisma.db.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        currency: true,
        subtotalMinor: true,
        items: { select: { title: true, productId: true, booking: { select: { startsAt: true, endsAt: true, customerTz: true, status: true } } } },
        workspace: { select: { slug: true, name: true } },
      },
    });
    if (!order) throw Errors.notFound("Order");
    return {
      status: order.status,
      currency: order.currency,
      amountMinor: order.subtotalMinor.toString(),
      workspace: order.workspace,
      items: order.items.map((i) => ({ title: i.title, kind: i.productId ? "product" : "booking" })),
      booking: (() => {
        const b = order.items.find((i) => i.booking)?.booking;
        return b ? { startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), customerTz: b.customerTz, status: b.status } : null;
      })(),
    };
  }
}
