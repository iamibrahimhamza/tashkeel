import { Controller, Get, Header, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CreateBookingInput, SlotsQuery, type BookingHold, type PublicServicePage, type SlotsResponse } from "@tashkeel/contracts";
import { addDays, BOOKING_HOLD_MINUTES, computeSlots, fromLocal, isSlotBookable } from "@tashkeel/core";
import { isExclusionViolation } from "@tashkeel/db";
import { Public } from "../../common/auth";
import { DomainError, Errors } from "../../common/errors";
import { Idempotent } from "../../common/idempotency";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody, ValidQuery } from "../../common/zod";
import { CheckoutService } from "../pay/checkout.service";
import { HoldsService } from "./holds.service";
import { loadAvailability, loadBusy, rulesOf } from "./schedule";

const slotTaken = () => new DomainError("SLOT_UNAVAILABLE", 409, "This time is no longer available", "لم يعد هذا الموعد متاحاً، اختر موعداً آخر");

@Controller("v1/public")
@Public()
export class PublicBookingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: CheckoutService,
    private readonly holds: HoldsService,
  ) {}

  private async activeService(slug: string, serviceId: string) {
    const s = await this.prisma.db.service.findFirst({
      where: { id: serviceId, isActive: true, workspace: { slug: slug.toLowerCase() } },
      include: { workspace: true },
    });
    if (!s) throw Errors.notFound("Service");
    return s;
  }

  @Header("Cache-Control", "public, max-age=60")
  @Get("homes/:slug/services/:serviceId")
  async service(@Param("slug") slug: string, @Param("serviceId") serviceId: string): Promise<PublicServicePage> {
    const s = await this.activeService(slug, serviceId);
    return {
      workspace: { slug: s.workspace.slug, name: s.workspace.name, timezone: s.workspace.timezone },
      service: {
        id: s.id,
        title: s.title,
        description: s.description,
        durationMin: s.durationMin,
        priceMinor: s.priceMinor.toString(),
        currency: s.currency,
        locationType: s.locationType,
        minNoticeMin: s.minNoticeMin,
        maxAdvanceDays: s.maxAdvanceDays,
      },
    };
  }

  /**
   * Bookable start times between two dates of the VISITOR's calendar, rendered in their
   * timezone. Rules are evaluated in the expert's timezone per date, so DST is handled.
   */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  @Get("homes/:slug/services/:serviceId/slots")
  async slots(@Param("slug") slug: string, @Param("serviceId") serviceId: string, @ValidQuery(SlotsQuery) q: SlotsQuery): Promise<SlotsResponse> {
    const s = await this.activeService(slug, serviceId);
    const now = new Date();
    const availability = await loadAvailability(this.prisma.db, s.workspaceId);
    // Generous instant window around the requested dates covers every timezone offset.
    const from = fromLocal(addDays(q.from, -2), "00:00", "UTC")!;
    const to = fromLocal(addDays(q.to, 2), "00:00", "UTC")!;
    const busy = await loadBusy(this.prisma.db, s.workspaceId, from, to, now);
    const slots = computeSlots(availability, rulesOf(s), busy, { from: q.from, to: q.to, displayTimezone: q.tz, now });
    return {
      serviceId: s.id,
      expertTimezone: availability.timezone,
      displayTimezone: q.tz,
      slots: slots.map((x) => ({ startsAt: x.startsAt.toISOString(), endsAt: x.endsAt.toISOString(), localDate: x.localDate, localTime: x.localTime })),
    };
  }

  /**
   * Holds the slot for BOOKING_HOLD_MINUTES and opens checkout for it. The slot is re-validated
   * server-side; a race for the same slot is settled by the database's no-overlap constraint.
   * Free sessions are confirmed immediately.
   */
  @Idempotent()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("bookings")
  async create(@ValidBody(CreateBookingInput) input: CreateBookingInput): Promise<BookingHold> {
    const db = this.prisma.db;
    const service = await db.service.findFirst({ where: { id: input.serviceId, isActive: true }, include: { workspace: true } });
    if (!service) throw Errors.notFound("Service");
    const now = new Date();
    const startsAt = new Date(input.startsAt);

    // Lapsed holds still occupy the slot in the constraint until they are released.
    await this.holds.expireDue(now, service.workspaceId);

    const availability = await loadAvailability(db, service.workspaceId);
    const busy = await loadBusy(db, service.workspaceId, new Date(startsAt.getTime() - 86_400_000), new Date(startsAt.getTime() + 86_400_000), now);
    const slot = isSlotBookable(availability, rulesOf(service), busy, startsAt, now);
    if (!slot) throw slotTaken();

    const customer = await db.user.upsert({
      where: { email: input.customer.email },
      update: {},
      create: { email: input.customer.email, name: input.customer.name, locale: input.locale },
    });

    let booking;
    try {
      booking = await db.booking.create({
        data: {
          workspaceId: service.workspaceId,
          serviceId: service.id,
          customerId: customer.id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          blockStartsAt: slot.blockStartsAt,
          blockEndsAt: slot.blockEndsAt,
          customerTz: input.customerTz,
          notes: input.notes ?? null,
          holdExpiresAt: new Date(now.getTime() + BOOKING_HOLD_MINUTES * 60_000),
        },
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw slotTaken();
      throw e;
    }

    try {
      const session = await this.checkout.start({
        workspace: service.workspace,
        line: { title: service.title, unitPriceMinor: service.priceMinor, currency: service.currency, bookingId: booking.id, serviceId: service.id },
        customer: { email: input.customer.email, name: input.customer.name },
        locale: input.locale,
        cancelPath: `/${service.workspace.slug}/book/${service.id}`,
      });
      const paid = session.status === "PAID";
      return {
        bookingId: booking.id,
        orderId: session.orderId,
        status: paid ? "CONFIRMED" : "PENDING_PAYMENT",
        checkoutUrl: session.checkoutUrl,
        holdExpiresAt: paid ? null : booking.holdExpiresAt!.toISOString(),
      };
    } catch (e) {
      // No way to pay: release the slot immediately instead of waiting for the hold to lapse.
      await db.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED", holdExpiresAt: null } });
      throw e;
    }
  }
}
