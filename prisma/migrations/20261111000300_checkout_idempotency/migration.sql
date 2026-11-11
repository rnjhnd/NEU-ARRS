-- Additive: historical quotes and submission identities cannot be invented.
ALTER TABLE "Request" ADD COLUMN "submissionKey" TEXT,
    ADD COLUMN "quotedAmountCentavos" INTEGER;
CREATE UNIQUE INDEX "Request_studentId_submissionKey_key" ON "Request"("studentId", "submissionKey");

CREATE TABLE "CheckoutAttempt" (
    "requestId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "credentialFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("requestId")
);
CREATE UNIQUE INDEX "CheckoutAttempt_idempotencyKey_key" ON "CheckoutAttempt"("idempotencyKey");
ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
