-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('TOR', 'GOOD_MORAL', 'DIPLOMA', 'ENROLLMENT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING', 'PROCESSING', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'CASH_ON_PICKUP');

-- CreateEnum
CREATE TYPE "Purpose" AS ENUM ('EMPLOYMENT', 'BOARD_EXAM', 'TRANSFER', 'SCHOLARSHIP', 'PERSONAL', 'OTHER');

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "purpose" "Purpose" NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymongoCheckoutId" TEXT,
    "paymongoPaymentId" TEXT,
    "paymongoPaymentType" TEXT,
    "amountPaid" INTEGER,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Request_studentId_idx" ON "Request"("studentId");

-- CreateIndex
CREATE INDEX "Request_status_idx" ON "Request"("status");

-- CreateIndex
CREATE INDEX "Request_paymentStatus_idx" ON "Request"("paymentStatus");
