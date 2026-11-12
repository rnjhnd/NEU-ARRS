CREATE TYPE "RoleChangeStage" AS ENUM ('PREPARED', 'APPLYING', 'REVOKING', 'COMPLETE', 'REJECTED');
CREATE TABLE "RoleAccess" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "role" TEXT NOT NULL CHECK ("role" IN ('admin', 'employee', 'student')),
  "operationId" TEXT NOT NULL,
  "blocked" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "RoleChangeOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "previousRole" TEXT NOT NULL CHECK ("previousRole" IN ('admin', 'employee', 'student')),
  "previousOperationId" TEXT NOT NULL,
  "nextRole" TEXT NOT NULL CHECK ("nextRole" IN ('admin', 'employee', 'student')),
  "stage" "RoleChangeStage" NOT NULL DEFAULT 'PREPARED',
  "activeKey" TEXT CHECK ("activeKey" IS NULL OR "activeKey" = 'global'),
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoleChangeOperation_active_stage" CHECK (
    ("stage" IN ('COMPLETE', 'REJECTED') AND "activeKey" IS NULL) OR
    ("stage" NOT IN ('COMPLETE', 'REJECTED') AND "activeKey" IS NOT NULL AND "activeKey" = 'global')
  )
);
CREATE UNIQUE INDEX "RoleChangeOperation_activeKey_key" ON "RoleChangeOperation"("activeKey");
