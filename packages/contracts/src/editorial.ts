import { z } from "zod";

export const PostStatus = z.enum(["DRAFT", "SCHEDULED", "PUBLISHED"]);

const PostSlug = z.string().min(1).max(120).regex(/^[a-z0-9؀-ۿ](?:[a-z0-9؀-ۿ-]*[a-z0-9؀-ۿ])?$/);

export const UpsertPostInput = z
  .object({
    slug: PostSlug,
    title: z.string().trim().min(2).max(200),
    excerpt: z.string().trim().max(400).optional(),
    bodyMd: z.string().max(200_000),
    coverKey: z.string().max(300).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    status: PostStatus.default("DRAFT"),
    publishAt: z.string().datetime({ offset: true }).optional(),
    seo: z
      .object({ title: z.string().max(70).optional(), description: z.string().max(170).optional(), canonicalUrl: z.string().url().optional() })
      .default({}),
  })
  .refine((p) => p.status !== "SCHEDULED" || !!p.publishAt, { message: "publishAt is required when scheduling", path: ["publishAt"] });
export type UpsertPostInput = z.infer<typeof UpsertPostInput>;

export const PostSummary = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().nullable(),
  coverUrl: z.string().nullable(),
  status: PostStatus,
  publishedAt: z.string().nullable(),
  readingMin: z.number(),
  tags: z.array(z.string()),
});
export type PostSummary = z.infer<typeof PostSummary>;

export const PostDetail = PostSummary.extend({
  bodyHtml: z.string(),
  seo: z.object({ title: z.string().optional(), description: z.string().optional(), canonicalUrl: z.string().optional() }),
  author: z.object({ name: z.string().nullable() }),
});
export type PostDetail = z.infer<typeof PostDetail>;

export const SubscribeInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  source: z.string().max(120).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "consent is required" }) }),
});
export type SubscribeInput = z.infer<typeof SubscribeInput>;
