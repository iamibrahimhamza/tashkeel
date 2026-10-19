import { Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  CreateWorkspaceInput,
  DEFAULT_THEME_ID,
  defaultHomeBlocks,
  Slug,
  UpdateWorkspaceInput,
  type WorkspaceDto,
} from "@tashkeel/contracts";
import type { Membership, Workspace } from "@tashkeel/db";
import {
  CurrentUser,
  CurrentWorkspace,
  Public,
  RequirePermission,
  type AuthUser,
  type WorkspaceContext,
} from "../../common/auth";
import { Errors } from "../../common/errors";
import { Idempotent } from "../../common/idempotency";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody } from "../../common/zod";

const EXPERT_ACCOUNTS = ["EXPERT_PENDING", "EXPERT_AVAILABLE", "PAYOUTS_IN_TRANSIT"] as const;

function toDto(w: Workspace, role: Membership["role"]): WorkspaceDto {
  return {
    id: w.id,
    slug: w.slug,
    name: w.name,
    country: w.country,
    timezone: w.timezone,
    currency: w.currency,
    planCode: w.planCode,
    role,
    createdAt: w.createdAt.toISOString(),
  };
}

@Controller("v1")
export class WorkspacesController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get("slugs/:slug/availability")
  async slugAvailability(@Param("slug") raw: string) {
    const parsed = Slug.safeParse(raw.toLowerCase());
    if (!parsed.success) return { slug: raw, isAvailable: false };
    const taken = await this.prisma.db.workspace.findUnique({ where: { slug: parsed.data }, select: { id: true } });
    return { slug: parsed.data, isAvailable: !taken };
  }

  /** Creates the workspace with its owner membership, starter home page and ledger accounts — atomically. */
  @Idempotent()
  @Post("workspaces")
  async create(@CurrentUser() user: AuthUser, @ValidBody(CreateWorkspaceInput) input: CreateWorkspaceInput): Promise<WorkspaceDto> {
    const ws = await this.prisma.db.$transaction(async (tx) => {
      const taken = await tx.workspace.findUnique({ where: { slug: input.slug }, select: { id: true } });
      if (taken) throw Errors.conflict("This link is already taken", "هذا الرابط محجوز");

      const w = await tx.workspace.create({
        data: { ...input, memberships: { create: { userId: user.id, role: "OWNER" } } },
      });
      const site = await tx.site.create({ data: { workspaceId: w.id, themeId: DEFAULT_THEME_ID, seo: { title: w.name } } });
      const page = await tx.page.create({ data: { siteId: site.id, path: "/", title: "الرئيسية" } });
      const v = await tx.pageVersion.create({ data: { pageId: page.id, blocks: defaultHomeBlocks(w.name), createdById: user.id } });
      await tx.page.update({ where: { id: page.id }, data: { status: "PUBLISHED", publishedVersionId: v.id } });
      await tx.ledgerAccount.createMany({
        data: EXPERT_ACCOUNTS.map((type) => ({ owner: "WORKSPACE" as const, workspaceId: w.id, type, currency: w.currency })),
      });
      await tx.auditLog.create({ data: { actorId: user.id, workspaceId: w.id, action: "workspace.create", target: w.slug } });
      return w;
    });
    return toDto(ws, "OWNER");
  }

  @Get("workspaces")
  async mine(@CurrentUser() user: AuthUser): Promise<{ data: WorkspaceDto[] }> {
    const memberships = await this.prisma.db.membership.findMany({
      where: { userId: user.id },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });
    return { data: memberships.map((m) => toDto(m.workspace, m.role)) };
  }

  @RequirePermission("workspace:read")
  @Get("workspaces/:workspaceId")
  async get(@CurrentWorkspace() ctx: WorkspaceContext): Promise<WorkspaceDto> {
    const w = await this.prisma.db.workspace.findUniqueOrThrow({ where: { id: ctx.id } });
    return toDto(w, ctx.role);
  }

  @RequirePermission("workspace:update")
  @Patch("workspaces/:workspaceId")
  async update(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @ValidBody(UpdateWorkspaceInput) input: UpdateWorkspaceInput,
  ): Promise<WorkspaceDto> {
    const w = await this.prisma.db.workspace.update({ where: { id: ctx.id }, data: input });
    await this.prisma.db.auditLog.create({ data: { actorId: user.id, workspaceId: ctx.id, action: "workspace.update", data: input } });
    return toDto(w, ctx.role);
  }
}
