import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { PAYMENT_GATEWAY, type PaymentGatewayAdapter } from "../pay/gateway";

/**
 * Releases slots whose 10-minute hold ran out unpaid: the booking is cancelled (freeing the
 * slot for the exclusion constraint), its order expires, and the gateway session is closed so
 * the buyer can no longer pay for a slot that may already belong to someone else.
 */
@Injectable()
export class HoldsService {
  private readonly log = new Logger("Holds");

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayAdapter,
  ) {}

  async expireDue(now = new Date(), workspaceId?: string): Promise<number> {
    const due = await this.prisma.db.booking.findMany({
      where: { status: "PENDING_PAYMENT", holdExpiresAt: { lte: now }, ...(workspaceId ? { workspaceId } : {}) },
      select: { id: true, orderItem: { select: { order: { select: { id: true, status: true, stripeCheckoutSessionId: true } } } } },
      take: 500,
    });
    let released = 0;
    for (const b of due) {
      const order = b.orderItem?.order;
      const closed = await this.prisma.db.$transaction(async (tx) => {
        // Lock the order first so a payment settling at this instant either wins or loses cleanly.
        if (order) await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
        const fresh = await tx.booking.findUnique({ where: { id: b.id }, select: { status: true } });
        if (fresh?.status !== "PENDING_PAYMENT") return false;
        await tx.booking.update({ where: { id: b.id }, data: { status: "CANCELLED", holdExpiresAt: null } });
        if (order) await tx.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "EXPIRED" } });
        return true;
      });
      if (!closed) continue;
      released++;
      if (order?.stripeCheckoutSessionId) {
        await this.gateway.expireCheckoutSession(order.stripeCheckoutSessionId).catch((e: unknown) => this.log.warn(`could not expire session ${order.stripeCheckoutSessionId}: ${String(e)}`));
      }
    }
    return released;
  }
}
