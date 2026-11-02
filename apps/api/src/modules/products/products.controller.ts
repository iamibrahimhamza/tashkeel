import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, Patch, Post, Res } from "@nestjs/common";
import {
  CreateProductInput,
  RequestCoverUploadInput,
  RequestUploadInput,
  UpdateProductInput,
  type ProductDetailDto,
  type ProductDto,
  type UploadTicket,
} from "@tashkeel/contracts";
import type { Product, ProductFile } from "@tashkeel/db";
import type { Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import type { z } from "zod";
import { CurrentUser, CurrentWorkspace, Public, RequirePermission, type AuthUser, type WorkspaceContext } from "../../common/auth";
import { DomainError, Errors } from "../../common/errors";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody } from "../../common/zod";
import { env } from "../../config/env";
import { OBJECT_STORAGE, safeKeyName, type ObjectStorage } from "../storage/storage";

const UPLOAD_URL_SEC = 15 * 60;
const MAX_FILES_PER_PRODUCT = 20;

export function productDto(p: Product): ProductDto {
  return {
    id: p.id,
    type: p.type,
    slug: p.slug,
    title: p.title,
    description: p.description,
    // The version suffix changes with every new cover, so caches never show a stale image.
    coverUrl: p.coverKey ? `${env().API_URL}/v1/public/products/${p.id}/cover?v=${createHash("sha256").update(p.coverKey).digest("hex").slice(0, 10)}` : null,
    priceMinor: p.priceMinor.toString(),
    currency: p.currency,
    status: p.status,
  };
}

const fileDto = (f: ProductFile) => ({ id: f.id, fileName: f.fileName, sizeBytes: f.sizeBytes.toString(), mime: f.mime, uploaded: f.uploadedAt !== null });

const needsFile = () => new DomainError("VALIDATION_ERROR", 422, "Upload at least one file before publishing", "ارفع ملفاً واحداً على الأقل قبل النشر");

/**
 * Expert-side product management. Files go straight from the browser to storage through
 * short-lived signed URLs; the API only records them and verifies the stored size afterwards.
 */
@Controller("v1/workspaces/:workspaceId/products")
export class ProductsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  private async product(workspaceId: string, productId: string) {
    const p = await this.prisma.db.product.findFirst({ where: { id: productId, workspaceId }, include: { files: { orderBy: { createdAt: "asc" } } } });
    if (!p) throw Errors.notFound("Product");
    return p;
  }

  private detail(p: Product & { files: ProductFile[] }): ProductDetailDto {
    return { ...productDto(p), files: p.files.map(fileDto) };
  }

  @RequirePermission("products:manage")
  @Get(":productId")
  async get(@CurrentWorkspace() ws: WorkspaceContext, @Param("productId") productId: string): Promise<ProductDetailDto> {
    return this.detail(await this.product(ws.id, productId));
  }

  @RequirePermission("products:manage")
  @Post()
  async create(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceContext, @ValidBody(CreateProductInput) input: CreateProductInput): Promise<ProductDetailDto> {
    // A product is born a draft: it has no files yet, so it cannot be bought.
    const p = await this.prisma.db.product.create({ data: { ...input, status: "DRAFT", workspaceId: ws.id }, include: { files: true } });
    await this.prisma.db.auditLog.create({ data: { actorId: user.id, workspaceId: ws.id, action: "product.create", target: p.id } });
    return this.detail(p);
  }

  @RequirePermission("products:manage")
  @Patch(":productId")
  async update(@CurrentWorkspace() ws: WorkspaceContext, @Param("productId") productId: string, @ValidBody(UpdateProductInput) input: z.infer<typeof UpdateProductInput>): Promise<ProductDetailDto> {
    const p = await this.product(ws.id, productId);
    if (input.status === "PUBLISHED" && !p.files.some((f) => f.uploadedAt)) throw needsFile();
    const updated = await this.prisma.db.product.update({ where: { id: p.id }, data: input, include: { files: { orderBy: { createdAt: "asc" } } } });
    return this.detail(updated);
  }

  @RequirePermission("products:manage")
  @Post(":productId/files")
  async requestUpload(@CurrentWorkspace() ws: WorkspaceContext, @Param("productId") productId: string, @ValidBody(RequestUploadInput) input: RequestUploadInput): Promise<UploadTicket> {
    const p = await this.product(ws.id, productId);
    if (p.files.length >= MAX_FILES_PER_PRODUCT) throw new DomainError("VALIDATION_ERROR", 422, `A product can hold up to ${MAX_FILES_PER_PRODUCT} files`, `يمكن أن يضم المنتج ${MAX_FILES_PER_PRODUCT} ملفاً كحد أقصى`);
    const id = randomBytes(12).toString("hex");
    const storageKey = `ws/${ws.id}/products/${p.id}/${id}/${safeKeyName(input.fileName)}`;
    const file = await this.prisma.db.productFile.create({ data: { productId: p.id, storageKey, fileName: input.fileName, sizeBytes: BigInt(input.sizeBytes), mime: input.mime } });
    const uploadUrl = await this.storage.presignUpload(storageKey, { mime: input.mime, sizeBytes: input.sizeBytes, expiresInSec: UPLOAD_URL_SEC });
    return { fileId: file.id, uploadUrl, mime: input.mime, expiresAt: new Date(Date.now() + UPLOAD_URL_SEC * 1000).toISOString() };
  }

  /** Confirms the upload landed with the declared size; until then the file is neither sold nor served. */
  @RequirePermission("products:manage")
  @HttpCode(200)
  @Post(":productId/files/:fileId/complete")
  async completeUpload(@CurrentWorkspace() ws: WorkspaceContext, @Param("productId") productId: string, @Param("fileId") fileId: string): Promise<ProductDetailDto> {
    const p = await this.product(ws.id, productId);
    const file = p.files.find((f) => f.id === fileId);
    if (!file) throw Errors.notFound("File");
    if (!file.uploadedAt) {
      const stored = await this.storage.head(file.storageKey);
      if (!stored) throw new DomainError("VALIDATION_ERROR", 422, "The file has not been uploaded yet", "لم يكتمل رفع الملف بعد");
      if (BigInt(stored.sizeBytes) !== file.sizeBytes) {
        await this.storage.delete(file.storageKey);
        await this.prisma.db.productFile.delete({ where: { id: file.id } });
        throw new DomainError("VALIDATION_ERROR", 422, "The uploaded file does not match its declared size", "حجم الملف المرفوع لا يطابق الحجم المعلن");
      }
      await this.prisma.db.productFile.update({ where: { id: file.id }, data: { uploadedAt: new Date() } });
    }
    return this.detail(await this.product(ws.id, productId));
  }

  @RequirePermission("products:manage")
  @HttpCode(200)
  @Delete(":productId/files/:fileId")
  async deleteFile(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceContext, @Param("productId") productId: string, @Param("fileId") fileId: string): Promise<ProductDetailDto> {
    const p = await this.product(ws.id, productId);
    const file = p.files.find((f) => f.id === fileId);
    if (!file) throw Errors.notFound("File");
    const othersUploaded = p.files.some((f) => f.id !== file.id && f.uploadedAt);
    if (p.status === "PUBLISHED" && file.uploadedAt && !othersUploaded) {
      throw Errors.conflict("A published product must keep at least one file", "يجب أن يبقى ملف واحد على الأقل في المنتج المنشور");
    }
    await this.prisma.db.productFile.delete({ where: { id: file.id } });
    await this.storage.delete(file.storageKey);
    await this.prisma.db.auditLog.create({ data: { actorId: user.id, workspaceId: ws.id, action: "product_file.delete", target: file.id, data: { productId: p.id, fileName: file.fileName } } });
    return this.detail(await this.product(ws.id, productId));
  }

  @RequirePermission("products:manage")
  @Post(":productId/cover")
  async requestCover(@CurrentWorkspace() ws: WorkspaceContext, @Param("productId") productId: string, @ValidBody(RequestCoverUploadInput) input: RequestCoverUploadInput): Promise<UploadTicket> {
    const p = await this.product(ws.id, productId);
    const key = `ws/${ws.id}/covers/${p.id}/${randomBytes(8).toString("hex")}`;
    const uploadUrl = await this.storage.presignUpload(key, { mime: input.mime, sizeBytes: input.sizeBytes, expiresInSec: UPLOAD_URL_SEC });
    return { fileId: key, uploadUrl, mime: input.mime, expiresAt: new Date(Date.now() + UPLOAD_URL_SEC * 1000).toISOString() };
  }

  @RequirePermission("products:manage")
  @HttpCode(200)
  @Post(":productId/cover/complete")
  async completeCover(@CurrentWorkspace() ws: WorkspaceContext, @Param("productId") productId: string, @Body() body: { key?: unknown }): Promise<ProductDetailDto> {
    const p = await this.product(ws.id, productId);
    const key = typeof body?.key === "string" ? body.key : "";
    // Only a key this endpoint could have issued for this product is accepted.
    if (!key.startsWith(`ws/${ws.id}/covers/${p.id}/`) || key.includes("..")) throw Errors.notFound("Cover");
    const stored = await this.storage.head(key);
    if (!stored) throw new DomainError("VALIDATION_ERROR", 422, "The cover has not been uploaded yet", "لم يكتمل رفع صورة الغلاف بعد");
    const previous = p.coverKey;
    await this.prisma.db.product.update({ where: { id: p.id }, data: { coverKey: key } });
    if (previous && previous !== key) await this.storage.delete(previous);
    return this.detail(await this.product(ws.id, productId));
  }
}

/** Product covers, served through short-lived signed redirects so the bucket itself stays private. */
@Controller("v1/public/products")
export class PublicCoversController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  @Public()
  @Header("Cache-Control", "public, max-age=3000")
  @Get(":productId/cover")
  async cover(@Param("productId") productId: string, @Res() res: Response) {
    const p = await this.prisma.db.product.findUnique({ where: { id: productId }, select: { coverKey: true, status: true } });
    if (!p?.coverKey || p.status === "ARCHIVED") throw Errors.notFound("Cover");
    res.redirect(302, await this.storage.presignDownload(p.coverKey, { fileName: "cover", expiresInSec: 3600, inline: true }));
  }
}
