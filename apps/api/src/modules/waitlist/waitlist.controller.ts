import { Controller, Get, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JoinWaitlistInput, PaginationQuery, type WaitlistEntryDto } from "@tashkeel/contracts";
import { Public, StaffOnly } from "../../common/auth";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody, ValidQuery } from "../../common/zod";

@Controller("v1")
export class WaitlistController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Joins (or updates) the pre-beta waitlist. The response is the same whether the email was
   * new or already listed, so the endpoint never reveals who has signed up.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post("public/waitlist")
  async join(@ValidBody(JoinWaitlistInput) input: JoinWaitlistInput) {
    // A repeat submission only overwrites what was filled in this time.
    const optional = {
      ...(input.specialty ? { specialty: input.specialty } : {}),
      ...(input.link ? { link: input.link } : {}),
      ...(input.source ? { source: input.source } : {}),
    };
    await this.prisma.db.waitlistEntry.upsert({
      where: { email: input.email },
      update: { name: input.name, locale: input.locale, ...optional },
      create: { email: input.email, name: input.name, locale: input.locale, ...optional },
    });
    return { ok: true };
  }

  @StaffOnly()
  @Get("admin/waitlist")
  async list(@ValidQuery(PaginationQuery) q: PaginationQuery): Promise<{ data: WaitlistEntryDto[]; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } }> {
    const [rows, total] = await Promise.all([
      this.prisma.db.waitlistEntry.findMany({ orderBy: { createdAt: q.sortOrder }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.db.waitlistEntry.count(),
    ]);
    return {
      data: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, specialty: r.specialty, link: r.link, locale: r.locale, source: r.source, createdAt: r.createdAt.toISOString() })),
      pagination: { page: q.page, pageSize: q.pageSize, totalItems: total, totalPages: Math.ceil(total / q.pageSize) },
    };
  }
}
