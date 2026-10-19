/**
 * Idempotent seed — platform configuration only, never invented business data:
 *   1. Themes and the fee plans (FREE, PRO, BUSINESS)
 *   2. Platform ledger accounts
 *   3. The founder: one SUPERADMIN user who owns an empty workspace (slug "ibrahim")
 *      with 0 orders, 0 clients and 0 revenue, so every screen shows its real empty state.
 *
 * Founder credentials come from the environment and are never committed:
 *   FOUNDER_EMAIL (required for step 3), FOUNDER_PASSWORD (generated and printed once if empty).
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { DEFAULT_THEME_ID, defaultHomeBlocks } from "@tashkeel/contracts";
import { hashPassword } from "@tashkeel/core";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const FOUNDER = { name: "إبراهيم حمزة", slug: "ibrahim" };

const THEMES: Array<{ id: string; name: string; nameAr: string; isDefault?: boolean; tokens: Prisma.InputJsonValue }> = [
  {
    id: "editorial-sand",
    name: "Editorial Sand",
    nameAr: "رملي تحريري",
    isDefault: true,
    tokens: {
      colors: { ink: "#19221E", paper: "#FAF8F6", sand: "#F3EFEA", accent: "#A98B4C", accentSoft: "#D4B87B", muted: "#6B6F69" },
      fonts: { display: "kufam", body: "plex" },
      radius: "soft",
      mode: "light",
    },
  },
  {
    id: "editorial-forest",
    name: "Editorial Forest",
    nameAr: "غابة تحريرية",
    tokens: {
      colors: { ink: "#FAF8F6", paper: "#19221E", sand: "#222C27", accent: "#D4B87B", accentSoft: "#A98B4C", muted: "#A9ADA6" },
      fonts: { display: "kufam", body: "plex" },
      radius: "soft",
      mode: "dark",
    },
  },
  {
    id: "editorial-ivory",
    name: "Editorial Ivory",
    nameAr: "عاجي",
    tokens: {
      colors: { ink: "#19221E", paper: "#FFFFFF", sand: "#FAF8F6", accent: "#A98B4C", accentSoft: "#E9DCC0", muted: "#6B6F69" },
      fonts: { display: "readex", body: "plex" },
      radius: "none",
      mode: "light",
    },
  },
];

const PLANS = [
  { code: "FREE", name: "Starter", nameAr: "البداية", monthlyMinor: 0n, feeBps: 800 },
  { code: "PRO", name: "Pro", nameAr: "المحترف", monthlyMinor: 2900n, feeBps: 400 },
  { code: "BUSINESS", name: "Business", nameAr: "الأعمال", monthlyMinor: 7900n, feeBps: 150 },
] as const;

async function seedPlatform() {
  for (const t of THEMES) {
    await prisma.theme.upsert({ where: { id: t.id }, update: { tokens: t.tokens, name: t.name, nameAr: t.nameAr }, create: { ...t, isDefault: t.isDefault ?? false } });
  }
  // Stripe price ids are attached later, once the live Stripe account exists.
  for (const p of PLANS) await prisma.plan.upsert({ where: { code: p.code }, update: { name: p.name, nameAr: p.nameAr, monthlyMinor: p.monthlyMinor, feeBps: p.feeBps }, create: p });

  for (const type of ["CUSTOMER_FUNDS", "PROCESSOR_FEES", "PLATFORM_REVENUE"] as const) {
    const existing = await prisma.ledgerAccount.findFirst({ where: { owner: "PLATFORM", type, currency: "USD", workspaceId: null } });
    if (!existing) await prisma.ledgerAccount.create({ data: { owner: "PLATFORM", type, currency: "USD" } });
  }
}

async function seedFounder(): Promise<void> {
  const email = process.env.FOUNDER_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.log("FOUNDER_EMAIL is not set — skipped the founder account.");
    return;
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const generated = !process.env.FOUNDER_PASSWORD;
    const password = process.env.FOUNDER_PASSWORD || randomBytes(12).toString("base64url");
    user = await prisma.user.create({
      data: { email, name: FOUNDER.name, platformRole: "SUPERADMIN", passwordHash: await hashPassword(password), emailVerified: new Date() },
    });
    if (generated) console.log(`Founder account created for ${email}. Temporary password (shown once): ${password}`);
  } else if (user.platformRole !== "SUPERADMIN") {
    user = await prisma.user.update({ where: { id: user.id }, data: { platformRole: "SUPERADMIN" } });
  }
  const founderId = user.id;

  if (await prisma.workspace.findUnique({ where: { slug: FOUNDER.slug } })) return;

  // Same shape POST /v1/workspaces creates: owner membership, starter page, ledger accounts.
  await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        slug: FOUNDER.slug,
        name: FOUNDER.name,
        timezone: process.env.FOUNDER_TIMEZONE || "Asia/Riyadh",
        memberships: { create: { userId: founderId, role: "OWNER" } },
      },
    });
    const site = await tx.site.create({ data: { workspaceId: ws.id, themeId: DEFAULT_THEME_ID, seo: { title: ws.name } } });
    const page = await tx.page.create({ data: { siteId: site.id, path: "/", title: "الرئيسية" } });
    const v = await tx.pageVersion.create({ data: { pageId: page.id, blocks: defaultHomeBlocks(ws.name), createdById: founderId } });
    await tx.page.update({ where: { id: page.id }, data: { status: "PUBLISHED", publishedVersionId: v.id } });
    await tx.ledgerAccount.createMany({
      data: (["EXPERT_PENDING", "EXPERT_AVAILABLE", "PAYOUTS_IN_TRANSIT"] as const).map((type) => ({ owner: "WORKSPACE" as const, workspaceId: ws.id, type, currency: ws.currency })),
    });
  });
  console.log(`Founder workspace "/${FOUNDER.slug}" created (empty).`);
}

async function main() {
  await seedPlatform();
  await seedFounder();
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
