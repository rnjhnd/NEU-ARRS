import "server-only";
import { Prisma, PaymentStatus, RequestStatus } from "@prisma/client";
import prisma from "../prisma";
import { CheckoutError, requireDocument, requireRequestAvailability, resumeCheckout } from "../checkout";
import { enqueueRequestNotification } from "../notification-content";
import { scheduleNotificationDelivery } from "../notification-wakeup";
import { finishCancellationRefunds } from "../cancellation-refunds";
import { toStudentRequestChange } from "../student-request-model";
import type { CreateRequestCommand } from "../request-commands";

export class RequestSubmissionError extends Error {
  constructor(readonly requestId: string | undefined, cause: unknown) { super("Request submission failed", { cause }); }
}
export class RequestOperationError extends Error {}

/** Internal application services. actorId is supplied only after live student authorization. */
export async function submitStudentRequest(actorId: string, input: CreateRequestCommand) {
  let requestId: string | undefined;
  try {
    const where = { studentId_submissionKey: { studentId: actorId, submissionKey: input.submissionKey } };
    let request = await prisma.request.findUnique({ where });
    if (!request) {
      await requireRequestAvailability(input.paymentMethod);
      const config = await requireDocument(input.documentTypeId, input.paymentMethod);
      const { documentTypeId, ...fields } = input;
      try {
        request = await prisma.request.create({ data: { ...fields, documentType: documentTypeId, studentId: actorId, quotedAmountCentavos: config.price,
          paymentStatus: input.paymentMethod === "cash" ? PaymentStatus.CASH_ON_PICKUP : PaymentStatus.UNPAID, status: RequestStatus.PENDING_PAYMENT } });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        request = await prisma.request.findUnique({ where }); if (!request) throw error;
      }
    }
    requestId = request.id;
    if (request.studentName !== input.studentName || request.studentNumber !== input.studentNumber || request.documentType !== input.documentTypeId || request.purpose !== input.purpose || request.paymentMethod !== input.paymentMethod) throw new CheckoutError("This submission already belongs to a different request. Check your dashboard before submitting again.");
    if (input.paymentMethod === "cash") return { success: true as const, requestId };
    return { success: true as const, requestId, redirectUrl: await resumeCheckout(request.id, actorId) };
  } catch (error) { throw new RequestSubmissionError(requestId, error); }
}

export async function cancelOwnRequest(actorId: string, requestId: string, reason: string) {
  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request || request.studentId !== actorId) throw new RequestOperationError("Request not found or unauthorized.");
  if (request.status !== "PENDING_PAYMENT") throw new RequestOperationError("Only pending requests can be cancelled.");
  const cancelled = await prisma.$transaction(async tx => {
    const saved = await tx.request.update({ where: { id: requestId, studentId: actorId, status: "PENDING_PAYMENT", updatedAt: request.updatedAt,
      paymentStatus: request.paymentStatus, paymentMethod: request.paymentMethod, paymongoPaymentId: request.paymongoPaymentId },
      data: { status: "CANCELLED", cancelReason: reason, notificationVersion: { increment: 1 } } });
    const event = await tx.auditLog.create({ data: { adminId: actorId, action: "STUDENT_CANCELLED_REQUEST", requestId,
      details: JSON.stringify({ fromStatus: request.status, toStatus: "CANCELLED", reason, refundRequested: request.paymentMethod === "online" && request.paymentStatus === "PAID", paymentClosureRequested: request.paymentMethod === "online" && request.paymentStatus === "UNPAID" }) } });
    await enqueueRequestNotification(tx, saved, event.id); return saved;
  }, { maxWait: 2000, timeout: 8000 });
  scheduleNotificationDelivery();
  const { reviewIds, refundedIds } = await finishCancellationRefunds([request], actorId, reason);
  return { success: true as const, request: toStudentRequestChange(refundedIds.length ? { ...cancelled, paymentStatus: PaymentStatus.REFUNDED } : cancelled),
    warning: reviewIds.length ? "Your request is cancelled, but payment closure or refund is not confirmed. Do not pay again; please contact the registrar." : undefined };
}
export async function resumeStudentCheckout(actorId: string, requestId: string) {
  return { success: true as const, redirectUrl: await resumeCheckout(requestId, actorId) };
}
