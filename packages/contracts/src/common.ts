import { z } from "zod";

/** Every error response from the API has exactly this shape. */
export const ErrorCode = z.enum([
  "BAD_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "IDEMPOTENCY_KEY_REUSED",
  "IDEMPOTENCY_IN_FLIGHT",
  "SLOT_UNAVAILABLE",
  "INSUFFICIENT_BALANCE",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    messageAr: z.string().optional(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export const Id = z.string().min(1).max(64);

/** Reserved slugs cannot be claimed by experts (they collide with app routes). */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "dashboard", "learn", "login", "logout", "signup", "pricing",
  "features", "blog", "help", "support", "terms", "privacy", "settings", "checkout", "pay", "preview",
  "static", "_next", "assets", "www", "en", "ar", "tashkeel",
]);

export const Slug = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "lowercase letters, digits and dashes only")
  .refine((s) => !RESERVED_SLUGS.has(s), "this link is reserved");

/** ISO-4217, upper-case. */
export const Currency = z.string().regex(/^[A-Z]{3}$/);

/** Money in integer minor units, serialized as a string to survive JSON (BigInt-safe). */
export const MoneyMinor = z.union([z.string().regex(/^-?\d+$/), z.number().int()]).transform((v) => BigInt(v));

export const Money = z.object({ amountMinor: z.string().regex(/^-?\d+$/), currency: Currency });
export type Money = z.infer<typeof Money>;

export const IanaTimezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "unknown IANA timezone");

export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm");
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export const Pagination = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
});

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), pagination: Pagination });
}

export type Paginated<T> = { data: T[]; pagination: z.infer<typeof Pagination> };

/** Clients generate one key per intent and resend it on retry. */
export const IDEMPOTENCY_HEADER = "idempotency-key";
export const IdempotencyKeyHeader = z.string().min(8).max(255);
