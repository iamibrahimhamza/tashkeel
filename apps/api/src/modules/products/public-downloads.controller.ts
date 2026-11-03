import { Controller, Get, HttpCode, Inject, Ip, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ResendDownloadsInput, type DownloadLink, type DownloadPage } from "@tashkeel/contracts";
import { Public } from "../../common/auth";
import { DomainError, Errors } from "../../common/errors";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody } from "../../common/zod";
import { OBJECT_STORAGE, type ObjectStorage } from "../storage/storage";
import { DOWNLOAD_POLICY, hashToken, issueDownloadAccess } from "./downloads";

const expired = () => new DomainError("LINK_EXPIRED", 410, "This download link has expired", "انتهت صلاحية رابط التنزيل");
const exhausted = () => new DomainError("DOWNLOAD_LIMIT_REACHED", 410, "This link has used all its downloads", "استُنفدت مرات التنزيل المتاحة لهذا الرابط");

/**
 * The buyer's side: the emailed link opens a page of files, each download consumes one of the
 * link's downloads and returns a storage URL that lives for five minutes. No account needed.
 */
@Controller("v1/public/downloads")
export class PublicDownloadsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** A refunded purchase, an unknown token and a revoked entitlement all look the same: 404. */
  private async access(token: string) {
    const a = await this.prisma.db.downloadAccess.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        entitlement: {
          include: { product: { include: { workspace: { select: { name: true, slug: true } }, files: { where: { uploadedAt: { not: null } }, orderBy: { createdAt: "asc" } } } } },
        },
      },
    });
    if (!a || a.entitlement.status !== "ACTIVE") throw Errors.notFound("Download");
    if (a.expiresAt <= new Date()) throw expired();
    return a;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(":token")
  async page(@Param("token") token: string): Promise<DownloadPage> {
    const a = await this.access(token);
    const p = a.entitlement.product;
    return {
      product: { title: p.title },
      expert: { name: p.workspace.name, slug: p.workspace.slug },
      files: p.files.map((f) => ({ id: f.id, fileName: f.fileName, sizeBytes: f.sizeBytes.toString(), mime: f.mime })),
      expiresAt: a.expiresAt.toISOString(),
      downloadsLeft: a.maxDownloads - a.downloadsUsed,
    };
  }

  /** POST, not GET, so link previews and prefetchers cannot spend the buyer's downloads. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post(":token/files/:fileId")
  async download(@Param("token") token: string, @Param("fileId") fileId: string, @Ip() ip: string): Promise<DownloadLink> {
    const a = await this.access(token);
    const file = a.entitlement.product.files.find((f) => f.id === fileId);
    if (!file) throw Errors.notFound("File");

    // One atomic statement decides concurrent clicks: the budget can never go negative.
    const spent = await this.prisma.db.$executeRaw`
      UPDATE "DownloadAccess" SET "downloadsUsed" = "downloadsUsed" + 1
      WHERE id = ${a.id} AND "downloadsUsed" < "maxDownloads" AND "expiresAt" > now()`;
    if (spent === 0) throw a.expiresAt <= new Date() ? expired() : exhausted();

    const expiresAt = new Date(Date.now() + DOWNLOAD_POLICY.fileUrlSec * 1000);
    await this.prisma.db.downloadGrant.create({ data: { entitlementId: a.entitlementId, fileId: file.id, accessId: a.id, expiresAt, ip } });
    const url = await this.storage.presignDownload(file.storageKey, { fileName: file.fileName, expiresInSec: DOWNLOAD_POLICY.fileUrlSec });
    return { url, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Sends fresh links for everything this email has bought. Always answers the same way, so it
   * cannot be used to learn who bought what.
   */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @Post("resend")
  async resend(@ValidBody(ResendDownloadsInput) input: ResendDownloadsInput): Promise<{ status: "queued" }> {
    const db = this.prisma.db;
    const user = await db.user.findUnique({ where: { email: input.email }, select: { id: true, email: true, locale: true } });
    if (!user) return { status: "queued" };
    const since = new Date(Date.now() - DOWNLOAD_POLICY.resendCooldownMs);
    const entitlements = await db.entitlement.findMany({
      where: { userId: user.id, status: "ACTIVE", product: { type: "FILE", files: { some: { uploadedAt: { not: null } } } } },
      include: { product: { select: { title: true, workspace: { select: { name: true } } } }, accesses: { where: { createdAt: { gt: since } }, select: { id: true } } },
      take: 20,
    });
    for (const e of entitlements) {
      if (e.accesses.length) continue;
      await db.$transaction((tx) => issueDownloadAccess(tx, { entitlementId: e.id, to: user.email, locale: user.locale, title: e.product.title, expert: e.product.workspace.name }));
    }
    return { status: "queued" };
  }
}
