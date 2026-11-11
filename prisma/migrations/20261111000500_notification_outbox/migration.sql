BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "Request" ADD COLUMN "notificationVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TYPE "NotificationState" AS ENUM ('QUEUED', 'IN_FLIGHT', 'SENT', 'REVIEW', 'SUPERSEDED');
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL,
    "correction" BOOLEAN NOT NULL DEFAULT false,
    "content" JSONB NOT NULL,
    "state" "NotificationState" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB,
    "firstAttemptAt" TIMESTAMP(3),
    "credentialFingerprint" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryLimit" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "providerEmailId" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationOutbox_requestId_version_key" ON "NotificationOutbox"("requestId", "version");
CREATE INDEX "NotificationOutbox_due_idx" ON "NotificationOutbox"("state", "nextAttemptAt", "createdAt", "id");
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
