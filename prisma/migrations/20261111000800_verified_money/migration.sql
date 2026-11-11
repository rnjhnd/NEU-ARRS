-- Add canonical money without converting, overwriting, or guessing legacy units.
CREATE TYPE "MoneySource" AS ENUM ('PAYMONGO_PAYMENT', 'CASH_CONFIRMATION', 'HISTORICAL_VERIFIED');
CREATE TABLE "RequestMoney" (
  "requestId" TEXT NOT NULL PRIMARY KEY REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "method" TEXT NOT NULL,
  "collectedCentavos" INTEGER NOT NULL,
  "source" "MoneySource" NOT NULL,
  "reference" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "refundedCentavos" INTEGER,
  "refundEvidenceId" TEXT REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "refundVerifiedAt" TIMESTAMP(3),
  CONSTRAINT "RequestMoney_currency_check" CHECK ("currency" = 'PHP'),
  CONSTRAINT "RequestMoney_collection_check" CHECK ("collectedCentavos" >= 0 AND ("method" <> 'online' OR "collectedCentavos" >= 100)),
  CONSTRAINT "RequestMoney_source_check" CHECK (("method" = 'online' AND "source" = 'PAYMONGO_PAYMENT') OR ("method" = 'cash' AND "source" IN ('CASH_CONFIRMATION', 'HISTORICAL_VERIFIED'))),
  CONSTRAINT "RequestMoney_refund_check" CHECK (("refundedCentavos" IS NULL AND "refundEvidenceId" IS NULL AND "refundVerifiedAt" IS NULL) OR
    ("refundedCentavos" IS NOT NULL AND "refundedCentavos" > 0 AND "refundedCentavos" <= "collectedCentavos" AND "refundEvidenceId" IS NOT NULL AND "refundVerifiedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "RequestMoney_reference_key" ON "RequestMoney"("reference");
CREATE UNIQUE INDEX "RequestMoney_evidenceId_key" ON "RequestMoney"("evidenceId");
CREATE UNIQUE INDEX "RequestMoney_refundEvidenceId_key" ON "RequestMoney"("refundEvidenceId");
