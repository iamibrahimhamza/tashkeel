import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().url(),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:4000"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()) : undefined)),

  // ── Tashkeel Pay ──
  /** Empty or "mock" → local sandbox gateway. A real sk_… key → Stripe. */
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  /** base64 of 32 random bytes; encrypts payout account details at rest. */
  PAYOUT_ENCRYPTION_KEY: optional,
  /** Shared secret alternative payout providers use to sign status callbacks (HMAC-SHA256). */
  PAYOUT_WEBHOOK_SECRET: optional,
  FUNDS_HOLD_DAYS: z.coerce.number().int().min(0).max(90).default(7),

  // ── Background jobs ──
  /** "inline" runs jobs in-process (dev/test); "bullmq" needs Redis and the worker process. */
  QUEUE_DRIVER: z.enum(["inline", "bullmq"]).default("inline"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SMTP_URL: optional,
  EMAIL_FROM: z.string().default("Tashkeel <no-reply@tashkeel.app>"),
});

export type Env = z.infer<typeof Env>;

let cached: Env | undefined;

/** Validated once at boot; the process refuses to start on bad configuration. */
export function env(): Env {
  if (!cached) {
    const parsed = Env.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid environment:\n${issues}`);
    }
    if (parsed.data.NODE_ENV === "production") {
      // The sandbox gateway must never run in production: real keys are mandatory there.
      const missing = (["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "PAYOUT_ENCRYPTION_KEY"] as const).filter((k) => !parsed.data[k] || parsed.data[k] === "mock");
      if (missing.length) throw new Error(`Invalid environment: ${missing.join(", ")} required in production`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Tests mutate process.env between suites. */
export function resetEnvCache() {
  cached = undefined;
}
