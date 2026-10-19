import { Controller, Get, HttpCode, Param, Patch, Post, Put } from "@nestjs/common";
import { CreateServiceInput, PutAvailabilityInput, UpdateServiceInput, type AvailabilityDto, type ServiceDto } from "@tashkeel/contracts";
import type { Prisma, Service } from "@tashkeel/db";
import type { z } from "zod";
import { CurrentUser, CurrentWorkspace, RequirePermission, type AuthUser, type WorkspaceContext } from "../../common/auth";
import { Errors } from "../../common/errors";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody } from "../../common/zod";
import { loadAvailability } from "./schedule";

export function serviceDto(s: Service): ServiceDto {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    durationMin: s.durationMin,
    bufferBeforeMin: s.bufferBeforeMin,
    bufferAfterMin: s.bufferAfterMin,
    priceMinor: s.priceMinor.toString(),
    currency: s.currency,
    locationType: s.locationType,
    minNoticeMin: s.minNoticeMin,
    maxAdvanceDays: s.maxAdvanceDays,
    isActive: s.isActive,
  };
}

/** Expert-side management of consultation services and the weekly schedule. */
@Controller("v1/workspaces/:workspaceId")
export class ServicesController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission("services:manage")
  @Get("services")
  async list(@CurrentWorkspace() ws: WorkspaceContext): Promise<{ data: ServiceDto[] }> {
    const rows = await this.prisma.db.service.findMany({ where: { workspaceId: ws.id }, orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] });
    return { data: rows.map(serviceDto) };
  }

  @RequirePermission("services:manage")
  @Post("services")
  async create(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceContext, @ValidBody(CreateServiceInput) input: CreateServiceInput): Promise<ServiceDto> {
    const s = await this.prisma.db.service.create({ data: { ...input, workspaceId: ws.id } });
    await this.prisma.db.auditLog.create({ data: { actorId: user.id, workspaceId: ws.id, action: "service.create", target: s.id } });
    return serviceDto(s);
  }

  /** Price and duration changes apply to new bookings only; existing bookings keep their own times and order. */
  @RequirePermission("services:manage")
  @Patch("services/:serviceId")
  async update(@CurrentWorkspace() ws: WorkspaceContext, @Param("serviceId") id: string, @ValidBody(UpdateServiceInput) input: z.infer<typeof UpdateServiceInput>): Promise<ServiceDto> {
    const existing = await this.prisma.db.service.findFirst({ where: { id, workspaceId: ws.id } });
    if (!existing) throw Errors.notFound("Service");
    return serviceDto(await this.prisma.db.service.update({ where: { id }, data: input }));
  }

  @RequirePermission("services:manage")
  @Get("availability")
  async getAvailability(@CurrentWorkspace() ws: WorkspaceContext): Promise<AvailabilityDto> {
    const a = await loadAvailability(this.prisma.db, ws.id);
    const byDay = new Map<number, Array<{ startLocal: string; endLocal: string }>>();
    for (const r of a.weekly) byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), { startLocal: r.startLocal, endLocal: r.endLocal }]);
    const today = new Date().toISOString().slice(0, 10);
    return {
      timezone: a.timezone,
      weekly: [...byDay.entries()].map(([weekday, windows]) => ({ weekday, windows })),
      overrides: Object.entries(a.overrides)
        .filter(([date]) => date >= today)
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([date, windows]) => ({ date, windows })),
    };
  }

  /** Replaces the whole schedule atomically; the timezone becomes the workspace's timezone. */
  @RequirePermission("services:manage")
  @HttpCode(200)
  @Put("availability")
  async putAvailability(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceContext, @ValidBody(PutAvailabilityInput) input: PutAvailabilityInput): Promise<AvailabilityDto> {
    await this.prisma.db.$transaction([
      this.prisma.db.availabilityRule.deleteMany({ where: { workspaceId: ws.id } }),
      this.prisma.db.availabilityOverride.deleteMany({ where: { workspaceId: ws.id } }),
      this.prisma.db.availabilityRule.createMany({
        data: input.weekly.flatMap((d) => d.windows.map((w) => ({ workspaceId: ws.id, timezone: input.timezone, weekday: d.weekday, startLocal: w.startLocal, endLocal: w.endLocal }))),
      }),
      this.prisma.db.availabilityOverride.createMany({
        data: input.overrides.map((o) => ({ workspaceId: ws.id, date: o.date, windows: o.windows as Prisma.InputJsonValue })),
      }),
      this.prisma.db.workspace.update({ where: { id: ws.id }, data: { timezone: input.timezone } }),
      this.prisma.db.auditLog.create({ data: { actorId: user.id, workspaceId: ws.id, action: "availability.update" } }),
    ]);
    return this.getAvailability(ws);
  }
}
