import type { AvailabilityInput, BusyInterval, ServiceRules } from "@tashkeel/core";
import type { PrismaClient, Service, Tx } from "@tashkeel/db";

type Db = PrismaClient | Tx;

/** The expert's weekly rules and date overrides, in their own timezone. */
export async function loadAvailability(db: Db, workspaceId: string): Promise<AvailabilityInput> {
  const [ws, rules, overrides] = await Promise.all([
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } }),
    db.availabilityRule.findMany({ where: { workspaceId }, orderBy: [{ weekday: "asc" }, { startLocal: "asc" }] }),
    db.availabilityOverride.findMany({ where: { workspaceId } }),
  ]);
  return {
    timezone: ws.timezone,
    weekly: rules.map((r) => ({ weekday: r.weekday, startLocal: r.startLocal, endLocal: r.endLocal })),
    overrides: Object.fromEntries(overrides.map((o) => [o.date, o.windows as Array<{ startLocal: string; endLocal: string }>])),
  };
}

/**
 * Time the expert is already committed: confirmed sessions plus holds that are still live.
 * Uses the buffered block ranges, so buffers between sessions are respected.
 */
export async function loadBusy(db: Db, workspaceId: string, from: Date, to: Date, now: Date): Promise<BusyInterval[]> {
  const rows = await db.booking.findMany({
    where: {
      workspaceId,
      blockStartsAt: { lt: to },
      blockEndsAt: { gt: from },
      OR: [{ status: "CONFIRMED" }, { status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } }],
    },
    select: { blockStartsAt: true, blockEndsAt: true },
  });
  return rows.map((r) => ({ start: r.blockStartsAt, end: r.blockEndsAt }));
}

export function rulesOf(s: Service): ServiceRules {
  return {
    durationMin: s.durationMin,
    bufferBeforeMin: s.bufferBeforeMin,
    bufferAfterMin: s.bufferAfterMin,
    minNoticeMin: s.minNoticeMin,
    maxAdvanceDays: s.maxAdvanceDays,
    // Offer starts on the hour/half-hour for short sessions, on the hour for long ones.
    stepMin: s.durationMin <= 30 ? 15 : 30,
  };
}
