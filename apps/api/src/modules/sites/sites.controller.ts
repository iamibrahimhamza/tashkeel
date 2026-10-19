import { Controller, Get, Header, HttpCode, Param, Patch, Post, Put } from "@nestjs/common";
import {
  SaveDraftInput,
  UpdateSiteInput,
  type PageBlocks,
  type PublicHome,
  type ThemeTokens,
} from "@tashkeel/contracts";
import type { Prisma } from "@tashkeel/db";
import {
  CurrentUser,
  CurrentWorkspace,
  Public,
  RequirePermission,
  type AuthUser,
  type WorkspaceContext,
} from "../../common/auth";
import { Errors } from "../../common/errors";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody } from "../../common/zod";
import { mergeTheme } from "./defaults";

@Controller("v1")
export class SitesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything the public renderer needs for /[slug], in one round trip. */
  @Public()
  @Header("Cache-Control", "public, max-age=30, stale-while-revalidate=300")
  @Get("public/homes/:slug")
  async publicHome(@Param("slug") slug: string): Promise<PublicHome> {
    const db = this.prisma.db;
    const ws = await db.workspace.findUnique({
      where: { slug: slug.toLowerCase() },
      include: {
        site: { include: { theme: true, pages: { where: { path: "/" }, include: { publishedVersion: true } } } },
      },
    });
    const page = ws?.site?.pages[0];
    if (!ws || !ws.site || !page?.publishedVersion) throw Errors.notFound("Page");

    const [services, products, posts] = await Promise.all([
      db.service.findMany({ where: { workspaceId: ws.id, isActive: true }, orderBy: { priceMinor: "desc" } }),
      db.product.findMany({ where: { workspaceId: ws.id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" } }),
      db.post.findMany({ where: { workspaceId: ws.id, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 12 }),
    ]);

    const seo = ws.site.seo as { title?: string; description?: string };
    return {
      workspace: { slug: ws.slug, name: ws.name, timezone: ws.timezone },
      theme: mergeTheme(ws.site.theme.tokens as ThemeTokens, ws.site.themeOverrides as Partial<ThemeTokens>),
      seo: { title: seo.title ?? ws.name, ...(seo.description ? { description: seo.description } : {}) },
      blocks: page.publishedVersion.blocks as PageBlocks,
      publishedAt: page.publishedVersion.createdAt.toISOString(),
      services: services.map((s) => ({ id: s.id, title: s.title, description: s.description, durationMin: s.durationMin, priceMinor: s.priceMinor.toString(), currency: s.currency })),
      products: products.map((p) => ({ id: p.id, type: p.type, slug: p.slug, title: p.title, description: p.description, coverUrl: null, priceMinor: p.priceMinor.toString(), currency: p.currency })),
      posts: posts.map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, publishedAt: (p.publishedAt ?? p.createdAt).toISOString(), readingMin: p.readingMin })),
    };
  }

  /** A single published product with its expert's theme, for /[slug]/p/[product]. */
  @Public()
  @Header("Cache-Control", "public, max-age=30, stale-while-revalidate=300")
  @Get("public/homes/:slug/products/:productSlug")
  async publicProduct(@Param("slug") slug: string, @Param("productSlug") productSlug: string) {
    const ws = await this.prisma.db.workspace.findUnique({ where: { slug: slug.toLowerCase() }, include: { site: { include: { theme: true } } } });
    if (!ws?.site) throw Errors.notFound("Product");
    const p = await this.prisma.db.product.findFirst({
      where: { workspaceId: ws.id, slug: decodeURIComponent(productSlug), status: "PUBLISHED" },
      include: { files: { select: { fileName: true, sizeBytes: true, mime: true } }, course: { include: { modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" }, select: { title: true, durationSec: true, isPreview: true } } } } } } },
    });
    if (!p) throw Errors.notFound("Product");
    return {
      workspace: { slug: ws.slug, name: ws.name },
      theme: mergeTheme(ws.site.theme.tokens as ThemeTokens, ws.site.themeOverrides as Partial<ThemeTokens>),
      product: {
        id: p.id,
        type: p.type,
        slug: p.slug,
        title: p.title,
        description: p.description,
        priceMinor: p.priceMinor.toString(),
        currency: p.currency,
        files: p.files.map((f) => ({ fileName: f.fileName, sizeBytes: f.sizeBytes.toString(), mime: f.mime })),
        modules: p.course?.modules.map((m) => ({ title: m.title, lessons: m.lessons })) ?? [],
      },
    };
  }

  @RequirePermission("site:edit")
  @Get("workspaces/:workspaceId/site")
  async getSite(@CurrentWorkspace() ctx: WorkspaceContext) {
    const site = await this.prisma.db.site.findUnique({
      where: { workspaceId: ctx.id },
      include: { pages: { where: { path: "/" }, include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    });
    if (!site) throw Errors.notFound("Site");
    const page = site.pages[0];
    const draft = page?.versions[0];
    return {
      themeId: site.themeId,
      themeOverrides: site.themeOverrides,
      seo: site.seo,
      page: page && {
        id: page.id,
        status: page.status,
        publishedVersionId: page.publishedVersionId,
        draftVersionId: draft?.id ?? null,
        hasUnpublishedChanges: !!draft && draft.id !== page.publishedVersionId,
        blocks: (draft?.blocks ?? []) as PageBlocks,
      },
    };
  }

  @RequirePermission("site:edit")
  @Patch("workspaces/:workspaceId/site")
  async updateSite(@CurrentWorkspace() ctx: WorkspaceContext, @ValidBody(UpdateSiteInput) input: UpdateSiteInput) {
    if (input.themeId) {
      const theme = await this.prisma.db.theme.findUnique({ where: { id: input.themeId } });
      if (!theme) throw Errors.notFound("Theme");
    }
    const site = await this.prisma.db.site.update({
      where: { workspaceId: ctx.id },
      data: {
        ...(input.themeId ? { themeId: input.themeId } : {}),
        ...(input.themeOverrides ? { themeOverrides: input.themeOverrides as Prisma.InputJsonValue } : {}),
        ...(input.seo ? { seo: input.seo } : {}),
      },
    });
    return { themeId: site.themeId, seo: site.seo, themeOverrides: site.themeOverrides };
  }

  /** Each save is a new immutable version; the public page keeps serving the published one. */
  @RequirePermission("site:edit")
  @Put("workspaces/:workspaceId/pages/home/draft")
  async saveDraft(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @ValidBody(SaveDraftInput) input: SaveDraftInput,
  ) {
    const page = await this.homePage(ctx.id);
    const v = await this.prisma.db.pageVersion.create({ data: { pageId: page.id, blocks: input.blocks, createdById: user.id } });
    return { versionId: v.id, createdAt: v.createdAt.toISOString() };
  }

  @RequirePermission("site:publish")
  @HttpCode(200)
  @Post("workspaces/:workspaceId/pages/home/publish")
  async publish(@CurrentUser() user: AuthUser, @CurrentWorkspace() ctx: WorkspaceContext) {
    const page = await this.homePage(ctx.id);
    const latest = await this.prisma.db.pageVersion.findFirst({ where: { pageId: page.id }, orderBy: { createdAt: "desc" } });
    if (!latest) throw Errors.notFound("Draft");
    await this.prisma.db.$transaction([
      this.prisma.db.page.update({ where: { id: page.id }, data: { status: "PUBLISHED", publishedVersionId: latest.id } }),
      this.prisma.db.auditLog.create({ data: { actorId: user.id, workspaceId: ctx.id, action: "page.publish", target: latest.id } }),
    ]);
    return { publishedVersionId: latest.id };
  }

  @Public()
  @Get("themes")
  async themes() {
    const themes = await this.prisma.db.theme.findMany({ orderBy: { isDefault: "desc" } });
    return { data: themes.map((t) => ({ id: t.id, name: t.name, nameAr: t.nameAr, tokens: t.tokens })) };
  }

  private async homePage(workspaceId: string) {
    const page = await this.prisma.db.page.findFirst({ where: { path: "/", site: { workspaceId } }, select: { id: true } });
    if (!page) throw Errors.notFound("Page");
    return page;
  }
}
