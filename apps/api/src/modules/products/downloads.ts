import type { Tx } from "@tashkeel/db";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env";

/** The founder's policy: an emailed link works for 30 days and 5 downloads; each file URL for 5 minutes. */
export const DOWNLOAD_POLICY = {
  linkDays: 30,
  maxDownloads: 5,
  fileUrlSec: 5 * 60,
  /** A buyer asking again within this window gets no new email (keeps the resend form from being used to spam). */
  resendCooldownMs: 10 * 60_000,
};

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Creates a download link for an entitlement and queues the email that carries it. Runs inside
 * the caller's transaction, so a paid order and its delivery email commit together.
 */
export async function issueDownloadAccess(
  tx: Tx,
  args: { entitlementId: string; to: string; locale: string; title: string; expert: string; now?: Date },
): Promise<{ accessId: string }> {
  const now = args.now ?? new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + DOWNLOAD_POLICY.linkDays * 86_400_000);
  const access = await tx.downloadAccess.create({
    data: { entitlementId: args.entitlementId, tokenHash: hashToken(token), expiresAt, maxDownloads: DOWNLOAD_POLICY.maxDownloads },
  });
  await tx.emailOutbox.create({
    data: {
      dedupeKey: `download:${access.id}`,
      to: args.to,
      template: "product_ready",
      locale: args.locale,
      // The raw token lives only in this outbox row and the email itself; the database keeps its hash.
      data: { title: args.title, expert: args.expert, link: `${env().WEB_URL}/d/${token}`, expiresAt: expiresAt.toISOString(), maxDownloads: DOWNLOAD_POLICY.maxDownloads },
    },
  });
  return { accessId: access.id };
}
