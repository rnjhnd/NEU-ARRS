-- No historical dates or money are inferred from workflow state or updatedAt.
CREATE TYPE "MoneyMovementKind" AS ENUM ('COLLECTION', 'REFUND');
CREATE TABLE "MoneyMovementDate" (
  "requestId" TEXT NOT NULL,
  "kind" "MoneyMovementKind" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evidenceId" TEXT NOT NULL,
  CONSTRAINT "MoneyMovementDate_pkey" PRIMARY KEY ("requestId", "kind"),
  CONSTRAINT "MoneyMovementDate_time_check" CHECK ("occurredAt" <= "recordedAt" + INTERVAL '5 minutes'),
  CONSTRAINT "MoneyMovementDate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RequestMoney"("requestId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MoneyMovementDate_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MoneyMovementDate_evidenceId_key" ON "MoneyMovementDate"("evidenceId");
CREATE INDEX "MoneyMovementDate_period_idx" ON "MoneyMovementDate"("kind", "occurredAt", "requestId");
CREATE INDEX "RequestMoney_paid_date_idx" ON "RequestMoney"("paidAt", "requestId");
CREATE TABLE "RequestCompletion" (
  "requestId" TEXT NOT NULL PRIMARY KEY,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "evidenceId" TEXT NOT NULL,
  CONSTRAINT "RequestCompletion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RequestCompletion_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RequestCompletion_evidenceId_key" ON "RequestCompletion"("evidenceId");

-- Protect dates from later enrichment/reconciliation writers as well as UI.
CREATE FUNCTION "guard_immutable_financial_event"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Recorded financial dates and completion evidence cannot be overwritten' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "MoneyMovementDate_immutable" BEFORE UPDATE ON "MoneyMovementDate" FOR EACH ROW EXECUTE FUNCTION "guard_immutable_financial_event"();
CREATE TRIGGER "RequestCompletion_immutable" BEFORE UPDATE ON "RequestCompletion" FOR EACH ROW EXECUTE FUNCTION "guard_immutable_financial_event"();

CREATE FUNCTION "guard_movement_date_evidence"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE parent public."RequestMoney"%ROWTYPE; collection_at timestamp; refund_at timestamp;
BEGIN
  SELECT * INTO parent FROM public."RequestMoney" WHERE "requestId" = NEW."requestId" FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF; -- The foreign key rejects missing money.
  IF NEW.kind = 'REFUND' AND parent."refundedCentavos" IS NULL THEN
    RAISE EXCEPTION 'A refund date requires confirmed refund evidence' USING ERRCODE = '23514';
  END IF;
  SELECT "occurredAt" INTO collection_at FROM public."MoneyMovementDate" WHERE "requestId" = NEW."requestId" AND kind = 'COLLECTION';
  SELECT "occurredAt" INTO refund_at FROM public."MoneyMovementDate" WHERE "requestId" = NEW."requestId" AND kind = 'REFUND';
  collection_at := COALESCE(parent."paidAt", collection_at);
  IF (NEW.kind = 'COLLECTION' AND parent."paidAt" IS NOT NULL AND NEW."occurredAt" <> parent."paidAt") OR
     (NEW.kind = 'REFUND' AND collection_at IS NOT NULL AND NEW."occurredAt" < collection_at) OR
     (NEW.kind = 'COLLECTION' AND refund_at IS NOT NULL AND NEW."occurredAt" > refund_at) THEN
    RAISE EXCEPTION 'Movement dates conflict with original evidence or chronology' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "MoneyMovementDate_evidence" BEFORE INSERT ON "MoneyMovementDate" FOR EACH ROW EXECUTE FUNCTION "guard_movement_date_evidence"();

CREATE FUNCTION "guard_original_payment_date"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE collection_at timestamp; refund_at timestamp;
BEGIN
  SELECT "occurredAt" INTO collection_at FROM public."MoneyMovementDate" WHERE "requestId" = NEW."requestId" AND kind = 'COLLECTION';
  SELECT "occurredAt" INTO refund_at FROM public."MoneyMovementDate" WHERE "requestId" = NEW."requestId" AND kind = 'REFUND';
  IF (OLD."paidAt" IS NOT NULL AND NEW."paidAt" IS DISTINCT FROM OLD."paidAt") OR
     (NEW."paidAt" IS NOT NULL AND collection_at IS NOT NULL AND NEW."paidAt" <> collection_at) OR
     (NEW."paidAt" IS NOT NULL AND refund_at IS NOT NULL AND NEW."paidAt" > refund_at) THEN
    RAISE EXCEPTION 'Original payment date conflicts; no overwrite allowed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "RequestMoney_payment_date" BEFORE UPDATE ON "RequestMoney" FOR EACH ROW EXECUTE FUNCTION "guard_original_payment_date"();
