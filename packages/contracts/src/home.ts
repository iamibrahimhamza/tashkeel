import { z } from "zod";

// ── Theme ────────────────────────────────────────────

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const ThemeTokens = z.object({
  colors: z.object({
    ink: Hex,
    paper: Hex,
    sand: Hex,
    accent: Hex,
    accentSoft: Hex,
    muted: Hex,
  }),
  fonts: z.object({
    display: z.enum(["kufam", "readex", "plex"]),
    body: z.enum(["plex", "readex"]),
  }),
  radius: z.enum(["none", "soft", "round"]),
  mode: z.enum(["light", "dark"]),
});
export type ThemeTokens = z.infer<typeof ThemeTokens>;

export const ThemeOverrides = ThemeTokens.deepPartial();

// ── Blocks ───────────────────────────────────────────

const BlockBase = z.object({
  id: z.string().min(1).max(40),
  hidden: z.boolean().optional(),
});

const Text = (max: number) => z.string().trim().max(max);
const Url = z.string().url().max(2048);

export const HeroBlock = BlockBase.extend({
  type: z.literal("hero"),
  props: z.object({
    eyebrow: Text(80).optional(),
    title: Text(140).min(1),
    subtitle: Text(400).optional(),
    imageKey: z.string().max(300).optional(),
    cta: z.object({ label: Text(40).min(1), href: z.string().max(2048) }).optional(),
    layout: z.enum(["split", "centered", "portrait"]).default("split"),
  }),
});

export const BioBlock = BlockBase.extend({
  type: z.literal("bio"),
  props: z.object({
    heading: Text(80).default("نبذة"),
    bodyMd: Text(6000).min(1),
    credentials: z.array(Text(120)).max(12).default([]),
  }),
});

export const ServicesBlock = BlockBase.extend({
  type: z.literal("services"),
  props: z.object({
    heading: Text(80).default("الاستشارات"),
    serviceIds: z.array(z.string()).max(24).optional(), // undefined = all active services
  }),
});

export const ProductsBlock = BlockBase.extend({
  type: z.literal("products"),
  props: z.object({
    heading: Text(80).default("المنتجات الرقمية"),
    kind: z.enum(["all", "files", "courses"]).default("all"),
    productIds: z.array(z.string()).max(24).optional(),
  }),
});

export const PostsBlock = BlockBase.extend({
  type: z.literal("posts"),
  props: z.object({
    heading: Text(80).default("أحدث المقالات"),
    limit: z.number().int().min(1).max(12).default(3),
  }),
});

export const TestimonialsBlock = BlockBase.extend({
  type: z.literal("testimonials"),
  props: z.object({
    heading: Text(80).default("قالوا عنّي"),
    items: z.array(z.object({ quote: Text(600).min(1), name: Text(80).min(1), role: Text(120).optional() })).max(20),
  }),
});

export const NewsletterBlock = BlockBase.extend({
  type: z.literal("newsletter"),
  props: z.object({
    heading: Text(120).default("رسالتي الأسبوعية"),
    body: Text(400).optional(),
    buttonLabel: Text(30).default("اشترك"),
  }),
});

export const LinksBlock = BlockBase.extend({
  type: z.literal("links"),
  props: z.object({
    heading: Text(80).optional(),
    items: z
      .array(z.object({ label: Text(60).min(1), href: Url, icon: z.enum(["x", "linkedin", "instagram", "youtube", "tiktok", "whatsapp", "telegram", "web", "email"]).default("web") }))
      .max(20),
  }),
});

export const FaqBlock = BlockBase.extend({
  type: z.literal("faq"),
  props: z.object({
    heading: Text(80).default("أسئلة شائعة"),
    items: z.array(z.object({ q: Text(200).min(1), a: Text(2000).min(1) })).max(30),
  }),
});

export const RichTextBlock = BlockBase.extend({
  type: z.literal("richText"),
  props: z.object({ bodyMd: Text(20000).min(1), width: z.enum(["narrow", "wide"]).default("narrow") }),
});

export const Block = z.discriminatedUnion("type", [
  HeroBlock,
  BioBlock,
  ServicesBlock,
  ProductsBlock,
  PostsBlock,
  TestimonialsBlock,
  NewsletterBlock,
  LinksBlock,
  FaqBlock,
  RichTextBlock,
]);
export type Block = z.infer<typeof Block>;
export type BlockType = Block["type"];

export const PageBlocks = z
  .array(Block)
  .max(50)
  .refine((blocks) => new Set(blocks.map((b) => b.id)).size === blocks.length, "block ids must be unique");
export type PageBlocks = z.infer<typeof PageBlocks>;

// ── Defaults ─────────────────────────────────────────

export const DEFAULT_THEME_ID = "editorial-sand";

/**
 * Starter page every new expert gets, so their link is never blank. Sections that need data
 * (services, products, posts) render nothing until the expert adds some — no placeholder content.
 */
export function defaultHomeBlocks(name: string): PageBlocks {
  return [
    { id: "hero", type: "hero", props: { title: name, layout: "centered" } },
    { id: "services", type: "services", props: { heading: "الاستشارات" } },
    { id: "products", type: "products", props: { heading: "المنتجات الرقمية", kind: "all" } },
    { id: "posts", type: "posts", props: { heading: "أحدث المقالات", limit: 3 } },
    { id: "newsletter", type: "newsletter", props: { heading: "رسالتي البريدية", buttonLabel: "اشترك" } },
  ];
}

// ── Requests / responses ─────────────────────────────

export const SaveDraftInput = z.object({ blocks: PageBlocks });
export type SaveDraftInput = z.infer<typeof SaveDraftInput>;

export const UpdateSiteInput = z.object({
  themeId: z.string().min(1).max(40).optional(),
  themeOverrides: ThemeOverrides.optional(),
  seo: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(170).optional(),
      ogImageKey: z.string().max(300).optional(),
    })
    .optional(),
});
export type UpdateSiteInput = z.infer<typeof UpdateSiteInput>;

const PublicService = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  durationMin: z.number(),
  priceMinor: z.string(),
  currency: z.string(),
});

const PublicProduct = z.object({
  id: z.string(),
  type: z.enum(["FILE", "COURSE"]),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  coverUrl: z.string().nullable(),
  priceMinor: z.string(),
  currency: z.string(),
});

const PublicPost = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().nullable(),
  publishedAt: z.string(),
  readingMin: z.number(),
});

/** Shape served to the public renderer for /[slug]: page blocks plus the data they reference. */
export const PublicHome = z.object({
  workspace: z.object({ slug: z.string(), name: z.string(), timezone: z.string() }),
  theme: ThemeTokens,
  seo: z.object({ title: z.string(), description: z.string().optional(), ogImageUrl: z.string().optional() }),
  blocks: PageBlocks,
  publishedAt: z.string(),
  services: z.array(PublicService),
  products: z.array(PublicProduct),
  posts: z.array(PublicPost),
});
export type PublicHome = z.infer<typeof PublicHome>;
