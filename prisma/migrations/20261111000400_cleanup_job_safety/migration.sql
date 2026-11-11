CREATE TABLE "CronJobState" (
    "name" TEXT NOT NULL,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "cursorCreatedAt" TIMESTAMP(3),
    "cursorId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CronJobState_pkey" PRIMARY KEY ("name")
);
CREATE INDEX "Request_cleanup_scan_idx"
    ON "Request"("paymentMethod", "status", "paymentStatus", "createdAt", "id");
