import { Controller, Get } from "@nestjs/common";
import { ContactsQuery, type BookingDto, type ContactDto, type ProductDto } from "@tashkeel/contracts";
import type { Prisma } from "@tashkeel/db";
import { CurrentWorkspace, RequirePermission, type WorkspaceContext } from "../../common/auth";
import { PrismaService } from "../../common/prisma.service";
import { ValidQuery } from "../../common/zod";

/**
 * Read-only lists behind the expert dashboard: clients, bookings, products. Creation flows for
 * bookings and products arrive with their modules; these lists are real from day one, so an
 * empty workspace shows true empty states.
 */
@Controller("v1/workspaces/:workspaceId")
export class RecordsController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission("contacts:read")
  @Get("contacts")
  async contacts(@CurrentWorkspace() ws: WorkspaceContext, @ValidQuery(ContactsQuery) q: ContactsQuery) {
    const where: Prisma.ContactWhereInput = {
      workspaceId: ws.id,
      ...(q.tag ? { tags: { has: q.tag } } : {}),
      ...(q.q ? { OR: [{ email: { contains: q.q, mode: "insensitive" } }, { name: { contains: q.q, mode: "insensitive" } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.contact.findMany({ where, orderBy: { [q.sortBy]: q.sortOrder }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.db.contact.count({ where }),
    ]);
    const data: ContactDto[] = rows.map((c) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      country: c.country,
      tags: c.tags,
      lifetimeValueMinor: c.lifetimeValueMinor.toString(),
      firstSeenAt: c.firstSeenAt.toISOString(),
      lastSeenAt: c.lastSeenAt.toISOString(),
    }));
    return { data, pagination: { page: q.page, pageSize: q.pageSize, totalItems: total, totalPages: Math.ceil(total / q.pageSize) } };
  }

  /** Upcoming and recent bookings (most recent 100). */
  @RequirePermission("bookings:read")
  @Get("bookings")
  async bookings(@CurrentWorkspace() ws: WorkspaceContext): Promise<{ data: BookingDto[] }> {
    const rows = await this.prisma.db.booking.findMany({
      where: { workspaceId: ws.id, status: { not: "PENDING_PAYMENT" } },
      include: { service: { select: { title: true } }, customer: { select: { name: true, email: true } } },
      orderBy: { startsAt: "desc" },
      take: 100,
    });
    return {
      data: rows.map((b) => ({
        id: b.id,
        serviceId: b.serviceId,
        serviceTitle: b.service.title,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        customerTz: b.customerTz,
        status: b.status,
        customer: b.customer,
        meetingUrl: b.meetingUrl,
      })),
    };
  }

  @RequirePermission("products:manage")
  @Get("products")
  async products(@CurrentWorkspace() ws: WorkspaceContext): Promise<{ data: ProductDto[] }> {
    const rows = await this.prisma.db.product.findMany({ where: { workspaceId: ws.id, status: { not: "ARCHIVED" } }, orderBy: { createdAt: "desc" } });
    return {
      data: rows.map((p) => ({
        id: p.id,
        type: p.type,
        slug: p.slug,
        title: p.title,
        description: p.description,
        coverUrl: null,
        priceMinor: p.priceMinor.toString(),
        currency: p.currency,
        status: p.status,
      })),
    };
  }
}
