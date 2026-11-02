import { Injectable } from "@nestjs/common";
import { REMINDER_LEADS, reminderDue } from "@tashkeel/core";
import { PrismaService } from "../../common/prisma.service";

const WINDOW_MS = Math.max(...REMINDER_LEADS.map((r) => r.leadMs));

/**
 * Queues 24h and 1h session reminders for the client and the expert. Runs every few minutes;
 * the outbox dedupeKey makes each reminder go out once however often or wherever it runs.
 */
@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  async queueDue(now = new Date()): Promise<number> {
    const db = this.prisma.db;
    const upcoming = await db.booking.findMany({
      where: { status: "CONFIRMED", startsAt: { gt: now, lte: new Date(now.getTime() + WINDOW_MS) } },
      include: {
        service: { select: { title: true } },
        customer: { select: { email: true, name: true, locale: true } },
        workspace: {
          select: { name: true, timezone: true, memberships: { where: { role: "OWNER" }, take: 1, select: { user: { select: { email: true, locale: true } } } } },
        },
      },
      orderBy: { startsAt: "asc" },
      take: 1000,
    });

    let queued = 0;
    for (const b of upcoming) {
      const kind = reminderDue({ startsAt: b.startsAt, bookedAt: b.createdAt }, now);
      if (!kind) continue;
      const base = { kind, bookingId: b.id, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), title: b.service.title, meetingUrl: b.meetingUrl };
      const owner = b.workspace.memberships[0]?.user;
      const res = await db.emailOutbox.createMany({
        skipDuplicates: true,
        data: [
          { dedupeKey: `reminder:${kind}:customer:${b.id}`, to: b.customer.email, template: "booking_reminder", locale: b.customer.locale, data: { ...base, with: b.workspace.name, timezone: b.customerTz } },
          ...(owner
            ? [{ dedupeKey: `reminder:${kind}:expert:${b.id}`, to: owner.email, template: "booking_reminder", locale: owner.locale, data: { ...base, with: b.customer.name ?? b.customer.email, timezone: b.workspace.timezone } }]
            : []),
        ],
      });
      queued += res.count;
    }
    return queued;
  }
}
