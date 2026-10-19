-- Integrity guarantees that Prisma's schema language cannot express.

-- 1) No two live bookings for the same expert may overlap (buffers included).
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "workspaceId" WITH =,
    tstzrange("blockStartsAt", "blockEndsAt", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING_PAYMENT', 'CONFIRMED'));

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_valid_range CHECK ("startsAt" < "endsAt" AND "blockStartsAt" <= "startsAt" AND "blockEndsAt" >= "endsAt");

-- 2) Platform-owned ledger accounts have NULL workspaceId, which a plain unique index ignores.
CREATE UNIQUE INDEX ledger_account_platform_unique
  ON "LedgerAccount" ("type", "currency")
  WHERE "workspaceId" IS NULL;

ALTER TABLE "LedgerAccount"
  ADD CONSTRAINT ledger_account_owner_consistent CHECK (
    ("owner" = 'PLATFORM' AND "workspaceId" IS NULL) OR
    ("owner" = 'WORKSPACE' AND "workspaceId" IS NOT NULL)
  );

-- 3) Every ledger transaction must balance to zero. Checked once per transaction at COMMIT.
CREATE OR REPLACE FUNCTION ledger_assert_balanced() RETURNS trigger AS $$
DECLARE
  total numeric;
BEGIN
  SELECT COALESCE(SUM("amountMinor"), 0) INTO total
    FROM "LedgerEntry" WHERE "transactionId" = NEW."transactionId";
  IF total <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced (sum=%)', NEW."transactionId", total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entry_balanced
  AFTER INSERT OR UPDATE ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_assert_balanced();

-- Ledger rows are append-only.
CREATE OR REPLACE FUNCTION ledger_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries are append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_append_only
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation();

-- 4) Money sanity.
ALTER TABLE "Order"   ADD CONSTRAINT order_amounts_non_negative CHECK ("subtotalMinor" >= 0 AND "platformFeeMinor" >= 0 AND "refundedMinor" >= 0 AND "refundedMinor" <= "subtotalMinor");
ALTER TABLE "Payout"  ADD CONSTRAINT payout_amount_positive CHECK ("amountMinor" > 0);
ALTER TABLE "Service" ADD CONSTRAINT service_duration_positive CHECK ("durationMin" > 0 AND "priceMinor" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT product_price_non_negative CHECK ("priceMinor" >= 0);
