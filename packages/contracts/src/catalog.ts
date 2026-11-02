import { z } from "zod";
import { Currency, MoneyMinor } from "./common";
import { ThemeTokens } from "./home";

export const ProductType = z.enum(["FILE", "COURSE"]);
export const ProductStatus = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

const ProductSlug = z.string().min(1).max(80).regex(/^[a-z0-9؀-ۿ](?:[a-z0-9؀-ۿ-]*[a-z0-9؀-ۿ])?$/);

export const CreateProductInput = z.object({
  /** Downloadable products only for now; courses arrive with the LMS. */
  type: ProductType.extract(["FILE"]).default("FILE"),
  slug: ProductSlug,
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(10000).optional(),
  priceMinor: MoneyMinor,
  currency: Currency.default("USD"),
  status: ProductStatus.default("DRAFT"),
});
export type CreateProductInput = z.infer<typeof CreateProductInput>;
export const UpdateProductInput = CreateProductInput.omit({ type: true }).partial();

export const ProductDto = z.object({
  id: z.string(),
  type: ProductType,
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  coverUrl: z.string().nullable(),
  priceMinor: z.string(),
  currency: z.string(),
  status: ProductStatus,
});
export type ProductDto = z.infer<typeof ProductDto>;

export const MAX_FILE_BYTES = 200 * 1024 ** 2; // 200 MB
export const MAX_COVER_BYTES = 5 * 1024 ** 2;
export const ALLOWED_FILE_MIME = [
  "application/pdf",
  "application/epub+zip",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
] as const;
export const ALLOWED_COVER_MIME = ["image/png", "image/jpeg", "image/webp"] as const;

export const RequestUploadInput = z.object({
  fileName: z.string().trim().min(1).max(200),
  mime: z.enum(ALLOWED_FILE_MIME),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
});
export type RequestUploadInput = z.infer<typeof RequestUploadInput>;

export const RequestCoverUploadInput = z.object({
  mime: z.enum(ALLOWED_COVER_MIME),
  sizeBytes: z.number().int().positive().max(MAX_COVER_BYTES),
});
export type RequestCoverUploadInput = z.infer<typeof RequestCoverUploadInput>;

/** The browser PUTs the file to uploadUrl with this exact Content-Type, then calls complete. */
export const UploadTicket = z.object({
  fileId: z.string(),
  uploadUrl: z.string(),
  mime: z.string(),
  expiresAt: z.string(),
});
export type UploadTicket = z.infer<typeof UploadTicket>;

export const ProductFileDto = z.object({ id: z.string(), fileName: z.string(), sizeBytes: z.string(), mime: z.string(), uploaded: z.boolean() });
export type ProductFileDto = z.infer<typeof ProductFileDto>;

export const ProductDetailDto = ProductDto.extend({ files: z.array(ProductFileDto) });
export type ProductDetailDto = z.infer<typeof ProductDetailDto>;

export const DownloadLink = z.object({ url: z.string(), expiresAt: z.string() });
export type DownloadLink = z.infer<typeof DownloadLink>;

/** What the buyer's emailed link opens: /d/[token]. */
export const DownloadPage = z.object({
  product: z.object({ title: z.string() }),
  expert: z.object({ name: z.string(), slug: z.string() }),
  files: z.array(z.object({ id: z.string(), fileName: z.string(), sizeBytes: z.string(), mime: z.string() })),
  expiresAt: z.string(),
  downloadsLeft: z.number(),
});
export type DownloadPage = z.infer<typeof DownloadPage>;

export const ResendDownloadsInput = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
export type ResendDownloadsInput = z.infer<typeof ResendDownloadsInput>;

// ── LMS ──────────────────────────────────────────────

export const LessonType = z.enum(["VIDEO", "TEXT", "FILE"]);

export const UpsertModuleInput = z.object({ title: z.string().trim().min(1).max(160), position: z.number().int().min(0) });
export const UpsertLessonInput = z.object({
  title: z.string().trim().min(1).max(160),
  position: z.number().int().min(0),
  type: LessonType,
  contentMd: z.string().max(100_000).optional(),
  videoAssetId: z.string().max(200).optional(),
  isPreview: z.boolean().default(false),
});

export const LessonSummary = z.object({
  id: z.string(),
  title: z.string(),
  type: LessonType,
  durationSec: z.number().nullable(),
  isPreview: z.boolean(),
  isLocked: z.boolean(),
  completedAt: z.string().nullable(),
});

export const CourseOutline = z.object({
  productId: z.string(),
  title: z.string(),
  hasAccess: z.boolean(),
  progressPercent: z.number().min(0).max(100),
  modules: z.array(z.object({ id: z.string(), title: z.string(), lessons: z.array(LessonSummary) })),
});
export type CourseOutline = z.infer<typeof CourseOutline>;

export const UpdateProgressInput = z.object({
  positionSec: z.number().int().min(0).max(60 * 60 * 24),
  isCompleted: z.boolean().optional(),
});

/** Served to /[slug]/p/[product]. */
export const PublicProductPage = z.object({
  workspace: z.object({ slug: z.string(), name: z.string() }),
  theme: ThemeTokens,
  product: z.object({
    id: z.string(),
    type: ProductType,
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    priceMinor: z.string(),
    currency: z.string(),
    files: z.array(z.object({ fileName: z.string(), sizeBytes: z.string(), mime: z.string() })),
    modules: z.array(z.object({ title: z.string(), lessons: z.array(z.object({ title: z.string(), durationSec: z.number().nullable(), isPreview: z.boolean() })) })),
  }),
});
export type PublicProductPage = z.infer<typeof PublicProductPage>;

export const CheckoutOrderStatus = z.object({
  status: z.enum(["PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED", "PARTIALLY_REFUNDED"]),
  currency: z.string(),
  amountMinor: z.string(),
  workspace: z.object({ slug: z.string(), name: z.string() }),
  items: z.array(z.object({ title: z.string(), kind: z.enum(["product", "booking"]) })),
  booking: z.object({ startsAt: z.string(), endsAt: z.string(), customerTz: z.string(), status: z.string() }).nullable().optional(),
});
export type CheckoutOrderStatus = z.infer<typeof CheckoutOrderStatus>;
