"use server";

import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireStudent } from "@/lib/auth";
import { Prisma, Purpose, PaymentStatus, RequestStatus } from "@prisma/client";
import { CheckoutError, requireDocument, requireRequestAvailability, resumeCheckout } from "@/lib/checkout";

import { enqueueRequestNotification } from "@/lib/notification-content";
import { scheduleNotificationDelivery } from "@/lib/notification-wakeup";
import { finishCancellationRefunds } from "@/lib/cancellation-refunds";
const CreateRequestSchema = z.object({
  submissionKey: z.string().uuid(),
  studentName: z.string().trim().min(2).max(200),
  studentNumber: z.string().regex(/^\d{2}-\d{5}-\d{3}$/),
  documentType: z.string().trim().min(1).max(100),
  purpose: z.enum(Purpose),
  paymentMethod: z.enum(["online", "cash"]),
});

export async function createRequest(formData: FormData) {
  let requestId: string | undefined;
  try {
    const studentId = await requireStudent();
    if (!(formData instanceof FormData)) return { success: false, code: "invalid" as const, error: "Invalid request form." };
    const allowed = ["submissionKey", "studentName", "studentNumber", "documentType", "purpose", "paymentMethod"];
    if (allowed.some(key => formData.getAll(key).length !== 1)) return { success: false, code: "invalid" as const, error: "Invalid request fields." };
    const parsed = CreateRequestSchema.safeParse(Object.fromEntries(
      ["submissionKey", "studentName", "studentNumber", "documentType", "purpose", "paymentMethod"].map(key => [key, formData.get(key)]),
    ));
    if (!parsed.success) return { success: false, code: "invalid" as const, error: "Invalid form data. Refresh the form and check your student details." };
    const input = parsed.data;
    const where = { studentId_submissionKey: { studentId, submissionKey: input.submissionKey } };
    let request = await prisma.request.findUnique({ where });
    if (!request) {
      await requireRequestAvailability(input.paymentMethod);
      const config = await requireDocument(input.documentType, input.paymentMethod);
      try {
        request = await prisma.request.create({ data: {
          ...input, studentId, quotedAmountCentavos: config.price,
          paymentStatus: input.paymentMethod === "cash" ? PaymentStatus.CASH_ON_PICKUP : PaymentStatus.UNPAID,
          status: RequestStatus.PENDING_PAYMENT,
        } });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        request = await prisma.request.findUnique({ where });
        if (!request) throw error;
      }
    }
    requestId = request.id;
    // An intent cannot be reused to silently change an existing order.
    if (["studentName", "studentNumber", "documentType", "purpose", "paymentMethod"].some(key =>
      request[key as keyof typeof request] !== input[key as keyof typeof input])) {
      throw new CheckoutError("This submission already belongs to a different request. Check your dashboard before submitting again.");
    }
    if (input.paymentMethod === "cash") return { success: true, requestId };
    const redirectUrl = await resumeCheckout(request.id, studentId);
    return { success: true, requestId, redirectUrl };
  } catch (error) {
    console.error("Failed to submit request", { requestId, error: error instanceof Error ? error.name : "UnknownError" });
    return { success: false, requestId, error: error instanceof CheckoutError ? error.message : "Request submission could not be confirmed. Check your dashboard before trying again." };
  }
}

export async function cancelStudentRequest(requestId: string, reason: string) {
  try {
    const studentId = await requireStudent();
    const input = z.object({ id: z.string().cuid(), reason: z.string().trim().min(1).max(1000) }).safeParse({ id: requestId, reason });
    if (!input.success) return { success: false, error: "A valid request and cancellation reason are required." };
    reason = input.data.reason;
    const request = await prisma.request.findUnique({ where: { id: requestId } });
    if (!request || request.studentId !== studentId) return { success: false, error: "Request not found or unauthorized." };
    if (request.status !== "PENDING_PAYMENT") return { success: false, error: "Only pending requests can be cancelled." };

    const cancelled = await prisma.$transaction(async tx => {
      const saved = await tx.request.update({
        where: {
          id: requestId, studentId, status: "PENDING_PAYMENT", updatedAt: request.updatedAt,
          paymentStatus: request.paymentStatus, paymentMethod: request.paymentMethod,
          paymongoPaymentId: request.paymongoPaymentId,
        },
        data: { status: "CANCELLED", cancelReason: reason, notificationVersion: { increment: 1 } },
      });
      const event = await tx.auditLog.create({
        data: {
          adminId: studentId, action: "STUDENT_CANCELLED_REQUEST", requestId,
          details: JSON.stringify({ fromStatus: request.status, toStatus: "CANCELLED", reason, refundRequested: request.paymentMethod === "online" && request.paymentStatus === "PAID", paymentClosureRequested: request.paymentMethod === "online" && request.paymentStatus === "UNPAID" }),
        },
      });
      await enqueueRequestNotification(tx, saved, event.id);
      return saved;
    }, { maxWait: 2000, timeout: 8000 });

    scheduleNotificationDelivery();
    const { reviewIds, refundedIds } = await finishCancellationRefunds([request], studentId, reason);

    return {
      success: true,
      request: refundedIds.length ? { ...cancelled, paymentStatus: PaymentStatus.REFUNDED } : cancelled,
      warning: reviewIds.length ? "Your request is cancelled, but payment closure or refund is not confirmed. Do not pay again; please contact the registrar." : undefined,
    };
  } catch (error) {
    console.error("Failed to cancel request:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
      return { success: false, error: "Request changed. Refresh your dashboard before cancelling." };
    }
    return { success: false, error: "Failed to cancel request." };
  }
}

export async function createRepaymentSession(requestId: string) {
  try {
    const studentId = await requireStudent();
    if (!z.string().cuid().safeParse(requestId).success) return { success: false, error: "Invalid request." };
    return { success: true, redirectUrl: await resumeCheckout(requestId, studentId) };
  } catch (error) {
    console.error("Failed to resume payment", { requestId, error: error instanceof Error ? error.name : "UnknownError" });
    return { success: false, error: error instanceof CheckoutError ? error.message : "Payment could not be confirmed. Wait 30 seconds, then retry from your dashboard." };
  }
}
