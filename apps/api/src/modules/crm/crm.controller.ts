import { Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import { CreateContactNoteInput, type ContactDetailDto, type ContactNoteDto } from "@tashkeel/contracts";
import { CurrentUser, CurrentWorkspace, RequirePermission, type AuthUser, type WorkspaceContext } from "../../common/auth";
import { Errors } from "../../common/errors";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody } from "../../common/zod";

const noteDto = (n: { id: string; body: string; createdAt: Date; author: { name: string | null; email: string } }): ContactNoteDto => ({
  id: n.id,
  body: n.body,
  author: n.author.name ?? n.author.email,
  createdAt: n.createdAt.toISOString(),
});

/**
 * One client's record: their bookings and orders with this expert, the activity timeline and the
 * expert's private notes. Every lookup starts from the contact inside the caller's workspace, so
 * an id from another workspace resolves to 404.
 */
@Controller("v1/workspaces/:workspaceId/contacts/:contactId")
export class CrmController {
  constructor(private readonly prisma: PrismaService) {}

  private async contact(workspaceId: string, contactId: string) {
    const c = await this.prisma.db.contact.findFirst({ where: { id: contactId, workspaceId } });
    if (!c) throw Errors.notFound("Contact");
    return c;
  }

  @RequirePermission("contacts:read")
  @Get()
  async detail(@CurrentWorkspace() ws: WorkspaceContext, @Param("contactId") contactId: string): Promise<ContactDetailDto> {
    const db = this.prisma.db;
    const c = await this.contact(ws.id, contactId);
    // Bookings and orders belong to the client's user account; contacts without one (imported) have neither.
    const byCustomer = c.userId ? { workspaceId: ws.id, customerId: c.userId } : null;
    const [bookings, orders, activity, notes] = await Promise.all([
      byCustomer
        ? db.booking.findMany({ where: { ...byCustomer, status: { not: "PENDING_PAYMENT" } }, include: { service: { select: { title: true } } }, orderBy: { startsAt: "desc" }, take: 50 })
        : [],
      byCustomer
        ? db.order.findMany({ where: { ...byCustomer, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } }, include: { items: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 50 })
        : [],
      db.activityEvent.findMany({ where: { workspaceId: ws.id, contactId: c.id }, orderBy: { at: "desc" }, take: 100 }),
      db.contactNote.findMany({ where: { contactId: c.id }, include: { author: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" } }),
    ]);
    return {
      contact: {
        id: c.id,
        email: c.email,
        name: c.name,
        country: c.country,
        tags: c.tags,
        lifetimeValueMinor: c.lifetimeValueMinor.toString(),
        firstSeenAt: c.firstSeenAt.toISOString(),
        lastSeenAt: c.lastSeenAt.toISOString(),
      },
      bookings: bookings.map((b) => ({ id: b.id, serviceTitle: b.service.title, startsAt: b.startsAt.toISOString(), status: b.status })),
      orders: orders.map((o) => ({ id: o.id, status: o.status, subtotalMinor: o.subtotalMinor.toString(), currency: o.currency, items: o.items.map((i) => i.title), paidAt: o.paidAt?.toISOString() ?? null })),
      activity: activity.map((a) => ({ id: a.id, type: a.type, at: a.at.toISOString(), data: a.data as Record<string, unknown> })),
      notes: notes.map(noteDto),
    };
  }

  @RequirePermission("contacts:write")
  @Post("notes")
  async addNote(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceContext, @Param("contactId") contactId: string, @ValidBody(CreateContactNoteInput) input: CreateContactNoteInput): Promise<ContactNoteDto> {
    const c = await this.contact(ws.id, contactId);
    const note = await this.prisma.db.contactNote.create({ data: { contactId: c.id, authorId: user.id, body: input.body }, include: { author: { select: { name: true, email: true } } } });
    return noteDto(note);
  }

  @RequirePermission("contacts:write")
  @HttpCode(204)
  @Delete("notes/:noteId")
  async deleteNote(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceContext, @Param("contactId") contactId: string, @Param("noteId") noteId: string): Promise<void> {
    const c = await this.contact(ws.id, contactId);
    const { count } = await this.prisma.db.contactNote.deleteMany({ where: { id: noteId, contactId: c.id } });
    if (!count) throw Errors.notFound("Note");
    await this.prisma.db.auditLog.create({ data: { actorId: user.id, workspaceId: ws.id, action: "contact_note.delete", target: noteId } });
  }
}
