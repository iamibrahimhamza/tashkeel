/** Entitlement-based access gates for digital files and course lessons. */

export interface EntitlementLike {
  status: "ACTIVE" | "REVOKED" | "REFUNDED";
  expiresAt: Date | null;
}

export type AccessDecision = { allowed: true } | { allowed: false; reason: "NO_ENTITLEMENT" | "REVOKED" | "EXPIRED" };

export function checkEntitlement(e: EntitlementLike | null | undefined, now: Date): AccessDecision {
  if (!e) return { allowed: false, reason: "NO_ENTITLEMENT" };
  if (e.status !== "ACTIVE") return { allowed: false, reason: "REVOKED" };
  if (e.expiresAt && e.expiresAt.getTime() <= now.getTime()) return { allowed: false, reason: "EXPIRED" };
  return { allowed: true };
}

export function canViewLesson(lesson: { isPreview: boolean }, e: EntitlementLike | null | undefined, now: Date): AccessDecision {
  if (lesson.isPreview) return { allowed: true };
  return checkEntitlement(e, now);
}

/** Signed download URLs are short-lived and rate limited per entitlement. */
export const DOWNLOAD_LINK_TTL_SEC = 300;
export const MAX_DOWNLOADS_PER_DAY = 10;

export function progressPercent(totalLessons: number, completedLessons: number): number {
  if (totalLessons <= 0) return 0;
  return Math.min(100, Math.round((completedLessons / totalLessons) * 100));
}
