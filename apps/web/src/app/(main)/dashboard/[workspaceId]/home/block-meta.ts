import type { Block, BlockType } from "@tashkeel/contracts";

type L = { ar: string; en: string };

export type FieldDef =
  | { key: string; label: L; kind: "text" | "textarea" | "url"; required?: boolean; max?: number; ltr?: boolean }
  | { key: string; label: L; kind: "select"; options: Array<{ value: string; label: L }> }
  | { key: string; label: L; kind: "number"; min: number; max: number }
  | { key: string; label: L; kind: "stringList"; itemLabel: L; max: number }
  | { key: string; label: L; kind: "items"; itemLabel: L; max: number; fields: FieldDef[] }
  | { key: string; label: L; kind: "picker"; source: "services" | "products" | "courses"; hint: L }
  | { key: "cta"; label: L; kind: "cta" };

export type BlockMeta = { type: BlockType; label: L; description: L; create: () => Block["props"]; fields: FieldDef[] };

const heading = (ar = "العنوان", en = "Heading"): FieldDef => ({ key: "heading", label: { ar, en }, kind: "text", max: 80 });

/** Every block the builder can add, its label, its starting props, and its inspector form. */
export const BLOCKS: BlockMeta[] = [
  {
    type: "hero",
    label: { ar: "الواجهة", en: "Hero" },
    description: { ar: "اسمك وما تقدّمه في جملة واحدة", en: "Who you are, in one line" },
    create: () => ({ title: "", layout: "centered" }),
    fields: [
      { key: "eyebrow", label: { ar: "سطر تمهيدي", en: "Eyebrow" }, kind: "text", max: 80 },
      { key: "title", label: { ar: "العنوان الرئيسي", en: "Title" }, kind: "text", required: true, max: 140 },
      { key: "subtitle", label: { ar: "الوصف", en: "Subtitle" }, kind: "textarea", max: 400 },
      {
        key: "layout",
        label: { ar: "التخطيط", en: "Layout" },
        kind: "select",
        options: [
          { value: "centered", label: { ar: "في المنتصف", en: "Centered" } },
          { value: "split", label: { ar: "نص وبطاقة", en: "Split" } },
          { value: "portrait", label: { ar: "صورة شخصية", en: "Portrait" } },
        ],
      },
      { key: "cta", label: { ar: "زر الدعوة", en: "Call to action" }, kind: "cta" },
    ],
  },
  {
    type: "bio",
    label: { ar: "نبذة", en: "Bio" },
    description: { ar: "قصتك وخبرتك ومؤهلاتك", en: "Your story and credentials" },
    create: () => ({ heading: "نبذة", bodyMd: "", credentials: [] }),
    fields: [
      heading(),
      { key: "bodyMd", label: { ar: "النص", en: "Text" }, kind: "textarea", required: true, max: 6000 },
      { key: "credentials", label: { ar: "المؤهلات والإنجازات", en: "Credentials" }, kind: "stringList", itemLabel: { ar: "مؤهل", en: "Credential" }, max: 12 },
    ],
  },
  {
    type: "services",
    label: { ar: "الاستشارات", en: "Services" },
    description: { ar: "جلساتك الاستشارية القابلة للحجز", en: "Your bookable sessions" },
    create: () => ({ heading: "الاستشارات" }),
    fields: [heading(), { key: "serviceIds", label: { ar: "الخدمات المعروضة", en: "Services shown" }, kind: "picker", source: "services", hint: { ar: "دون اختيار تُعرض كل الخدمات النشطة", en: "None selected shows all active services" } }],
  },
  {
    type: "products",
    label: { ar: "المنتجات الرقمية", en: "Products" },
    description: { ar: "كتب وأدلة وقوالب", en: "Ebooks, guides, templates" },
    create: () => ({ heading: "المنتجات الرقمية", kind: "files" }),
    fields: [
      heading(),
      {
        key: "kind",
        label: { ar: "النوع", en: "Kind" },
        kind: "select",
        options: [
          { value: "files", label: { ar: "ملفات رقمية", en: "Digital files" } },
          { value: "all", label: { ar: "الكل", en: "All" } },
          { value: "courses", label: { ar: "دورات فقط", en: "Courses only" } },
        ],
      },
      { key: "productIds", label: { ar: "المنتجات المعروضة", en: "Products shown" }, kind: "picker", source: "products", hint: { ar: "دون اختيار تُعرض كل المنتجات المنشورة", en: "None selected shows all published products" } },
    ],
  },
  {
    type: "courses",
    label: { ar: "الدورات", en: "Courses" },
    description: { ar: "دوراتك ووحداتها", en: "Your courses" },
    create: () => ({ heading: "الدورات" }),
    fields: [heading(), { key: "productIds", label: { ar: "الدورات المعروضة", en: "Courses shown" }, kind: "picker", source: "courses", hint: { ar: "دون اختيار تُعرض كل الدورات المنشورة", en: "None selected shows all published courses" } }],
  },
  {
    type: "posts",
    label: { ar: "أحدث المقالات", en: "Latest posts" },
    description: { ar: "من مدوّنتك", en: "From your blog" },
    create: () => ({ heading: "أحدث المقالات", limit: 3 }),
    fields: [heading(), { key: "limit", label: { ar: "عدد المقالات", en: "Number of posts" }, kind: "number", min: 1, max: 12 }],
  },
  {
    type: "testimonials",
    label: { ar: "شهادات العملاء", en: "Testimonials" },
    description: { ar: "شهادات حقيقية من عملائك", en: "Real words from real clients" },
    create: () => ({ heading: "قالوا عنّي", items: [] }),
    fields: [
      heading(),
      {
        key: "items",
        label: { ar: "الشهادات", en: "Testimonials" },
        kind: "items",
        itemLabel: { ar: "شهادة", en: "Testimonial" },
        max: 20,
        fields: [
          { key: "quote", label: { ar: "النص", en: "Quote" }, kind: "textarea", required: true, max: 600 },
          { key: "name", label: { ar: "الاسم", en: "Name" }, kind: "text", required: true, max: 80 },
          { key: "role", label: { ar: "الصفة", en: "Role" }, kind: "text", max: 120 },
        ],
      },
    ],
  },
  {
    type: "newsletter",
    label: { ar: "الرسالة البريدية", en: "Newsletter" },
    description: { ar: "اشتراك القرّاء في قائمتك", en: "Grow a list you own" },
    create: () => ({ heading: "رسالتي البريدية", buttonLabel: "اشترك" }),
    fields: [
      { key: "heading", label: { ar: "العنوان", en: "Heading" }, kind: "text", max: 120 },
      { key: "body", label: { ar: "الوصف", en: "Description" }, kind: "textarea", max: 400 },
      { key: "buttonLabel", label: { ar: "نص الزر", en: "Button label" }, kind: "text", max: 30 },
    ],
  },
  {
    type: "links",
    label: { ar: "روابط", en: "Links" },
    description: { ar: "حساباتك وروابطك المهمة", en: "Your profiles and links" },
    create: () => ({ items: [] }),
    fields: [
      heading(),
      {
        key: "items",
        label: { ar: "الروابط", en: "Links" },
        kind: "items",
        itemLabel: { ar: "رابط", en: "Link" },
        max: 20,
        fields: [
          { key: "label", label: { ar: "النص", en: "Label" }, kind: "text", required: true, max: 60 },
          { key: "href", label: { ar: "الرابط", en: "URL" }, kind: "url", required: true, ltr: true },
          {
            key: "icon",
            label: { ar: "النوع", en: "Type" },
            kind: "select",
            options: ["web", "x", "linkedin", "instagram", "youtube", "tiktok", "whatsapp", "telegram", "email"].map((v) => ({ value: v, label: { ar: v, en: v } })),
          },
        ],
      },
    ],
  },
  {
    type: "faq",
    label: { ar: "أسئلة شائعة", en: "FAQ" },
    description: { ar: "أجب عمّا يسأله عملاؤك", en: "Answer common questions" },
    create: () => ({ heading: "أسئلة شائعة", items: [] }),
    fields: [
      heading(),
      {
        key: "items",
        label: { ar: "الأسئلة", en: "Questions" },
        kind: "items",
        itemLabel: { ar: "سؤال", en: "Question" },
        max: 30,
        fields: [
          { key: "q", label: { ar: "السؤال", en: "Question" }, kind: "text", required: true, max: 200 },
          { key: "a", label: { ar: "الجواب", en: "Answer" }, kind: "textarea", required: true, max: 2000 },
        ],
      },
    ],
  },
  {
    type: "richText",
    label: { ar: "نص حر", en: "Custom text" },
    description: { ar: "فقرة بتنسيق بسيط", en: "A free-form section" },
    create: () => ({ bodyMd: "", width: "narrow" }),
    fields: [
      { key: "bodyMd", label: { ar: "النص (يدعم ## للعناوين و ** للتشديد)", en: "Text (## headings, **bold**)" }, kind: "textarea", required: true, max: 20000 },
      {
        key: "width",
        label: { ar: "العرض", en: "Width" },
        kind: "select",
        options: [
          { value: "narrow", label: { ar: "ضيّق", en: "Narrow" } },
          { value: "wide", label: { ar: "عريض", en: "Wide" } },
        ],
      },
    ],
  },
];

export const metaOf = (type: BlockType) => BLOCKS.find((b) => b.type === type)!;

export function newBlock(type: BlockType): Block {
  const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, type, props: metaOf(type).create() } as Block;
}
