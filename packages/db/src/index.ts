import { Prisma, PrismaClient } from "@prisma/client";

export * from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __tashkeelPrisma?: PrismaClient };

function client(): PrismaClient {
  globalForPrisma.__tashkeelPrisma ??= new PrismaClient({
    // Expected unique violations (idempotency claims) are handled by callers, so tests stay quiet.
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : process.env.NODE_ENV === "test" ? [] : ["error"],
  });
  return globalForPrisma.__tashkeelPrisma;
}

/**
 * One client per process, created on first use (so it reads DATABASE_URL after configuration
 * is loaded) and reused across hot reloads in development.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c) as unknown;
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(c) : value;
  },
});

export type Tx = Prisma.TransactionClient;

/** Postgres unique_violation surfaced by Prisma. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Postgres exclusion_violation (23P01), e.g. overlapping bookings. */
export function isExclusionViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : "";
  return msg.includes("23P01") || msg.includes("booking_no_overlap");
}
