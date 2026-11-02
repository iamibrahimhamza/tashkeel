-- Product files are only sold or served once the stored object has been verified.
ALTER TABLE "ProductFile" ADD COLUMN "uploadedAt" TIMESTAMPTZ(3);

-- The buyer's emailed download link (token stored as SHA-256 only) and its download budget.
CREATE TABLE "DownloadAccess" (
    "id" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "maxDownloads" INTEGER NOT NULL,
    "downloadsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadAccess_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "download_access_budget" CHECK ("maxDownloads" > 0 AND "downloadsUsed" >= 0 AND "downloadsUsed" <= "maxDownloads")
);
CREATE UNIQUE INDEX "DownloadAccess_tokenHash_key" ON "DownloadAccess"("tokenHash");
CREATE INDEX "DownloadAccess_entitlementId_idx" ON "DownloadAccess"("entitlementId");
ALTER TABLE "DownloadAccess" ADD CONSTRAINT "DownloadAccess_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "Entitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DownloadGrant" ADD COLUMN "accessId" TEXT;
ALTER TABLE "DownloadGrant" ADD CONSTRAINT "DownloadGrant_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "DownloadAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;
