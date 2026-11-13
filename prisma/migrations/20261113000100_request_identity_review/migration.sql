-- Existing requests deliberately remain unverified. No identity is inferred
-- from payment, historical status, email, or a Clerk profile.
CREATE TABLE "RequestIdentityReview" (
    "requestId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "verifiedBy" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidenceId" TEXT NOT NULL,
    CONSTRAINT "RequestIdentityReview_pkey" PRIMARY KEY ("requestId")
);
CREATE UNIQUE INDEX "RequestIdentityReview_evidenceId_key" ON "RequestIdentityReview"("evidenceId");
ALTER TABLE "RequestIdentityReview" ADD CONSTRAINT "RequestIdentityReview_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestIdentityReview" ADD CONSTRAINT "RequestIdentityReview_evidenceId_fkey"
    FOREIGN KEY ("evidenceId") REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
