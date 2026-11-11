BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Required identities cannot be reconstructed from the old schema. Fresh
-- databases pass immediately; populated upgrades require a verified backfill.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Request"
    WHERE NULLIF(btrim("studentName"), '') IS NULL
       OR NULLIF(btrim("studentNumber"), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Verified student identity backfill required before contracting Request schema. See docs/remediation/04-migration-alignment.md';
  END IF;
END $$;

ALTER TABLE "Request"
  ALTER COLUMN "studentName" SET NOT NULL,
  ALTER COLUMN "studentNumber" SET NOT NULL;

-- PENDING formerly meant queued for review. Keep it queued rather than
-- automatically beginning fulfillment or changing its financial state.
INSERT INTO "AuditLog" ("id", "adminId", "action", "details", "requestId")
SELECT
  'migration:20261111000200:pending:' || "id",
  'system:migration',
  'LEGACY_STATUS_MAPPED',
  json_build_object(
    'fromStatus', 'PENDING',
    'toStatus', 'PENDING_PAYMENT',
    'reason', 'Preserve queued review; do not auto-fulfill legacy requests',
    'previousUpdatedAt', "updatedAt"
  )::TEXT,
  "id"
FROM "Request" WHERE "status"::TEXT = 'PENDING';

UPDATE "Request"
SET "status" = 'PENDING_PAYMENT', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status"::TEXT = 'PENDING';

-- PostgreSQL cannot remove one enum value in place. Recreate the enum after
-- mapping every obsolete value, preserving all remaining labels and ordering.
ALTER TABLE "Request" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "RequestStatus_new" AS ENUM ('PENDING_PAYMENT', 'PROCESSING', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED');
ALTER TABLE "Request" ALTER COLUMN "status" TYPE "RequestStatus_new"
  USING "status"::TEXT::"RequestStatus_new";
DROP TYPE "RequestStatus";
ALTER TYPE "RequestStatus_new" RENAME TO "RequestStatus";
ALTER TABLE "Request" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT'::"RequestStatus";

-- amountPaid and all payment/provider references are intentionally unchanged.
COMMIT;
