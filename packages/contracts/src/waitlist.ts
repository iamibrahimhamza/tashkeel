import { z } from "zod";

/** Pre-beta interest form on the landing page. */
export const JoinWaitlistInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  specialty: z.string().trim().max(120).optional(),
  link: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : undefined))
    .pipe(z.string().url().optional()),
  locale: z.enum(["ar", "en"]).default("ar"),
  source: z.string().max(60).optional(),
});
export type JoinWaitlistInput = z.infer<typeof JoinWaitlistInput>;

export const WaitlistEntryDto = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  specialty: z.string().nullable(),
  link: z.string().nullable(),
  locale: z.string(),
  source: z.string().nullable(),
  createdAt: z.string(),
});
export type WaitlistEntryDto = z.infer<typeof WaitlistEntryDto>;
