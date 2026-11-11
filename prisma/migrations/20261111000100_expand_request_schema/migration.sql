-- Forward-only expansion from the checked-in initial schema. Keep the original
-- migration unchanged. Identity data is deliberately not invented here.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';

ALTER TABLE "Request"
  ADD COLUMN "studentName" TEXT,
  ADD COLUMN "studentNumber" TEXT;

ALTER TABLE "Request"
  ALTER COLUMN "documentType" TYPE TEXT USING "documentType"::TEXT;
DROP TYPE "DocumentType";

CREATE TABLE "DocumentConfig" (
  "id" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemSettings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentConfig_typeId_key" ON "DocumentConfig"("typeId");
CREATE UNIQUE INDEX "SystemSettings_key_key" ON "SystemSettings"("key");
CREATE INDEX "AuditLog_adminId_idx" ON "AuditLog"("adminId");
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

COMMIT;
