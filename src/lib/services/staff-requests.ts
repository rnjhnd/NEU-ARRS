import "server-only";
import prisma from "../prisma";
import { enqueueRequestNotification, loadNotificationSettings } from "../notification-content";
import { scheduleNotificationDelivery } from "../notification-wakeup";
import { finishCancellationRefunds } from "../cancellation-refunds";
import { getStatusChangeError, isStatusReversal } from "../request-workflow";
import { confirmCashCollection } from "../monetary-ledger";
import { hasVerifiedRequestIdentity, identityReviewSelect } from "../request-identity";
import type { StatusChangeCommand } from "../request-commands";

export class StatusChangeError extends Error {}
/** Capability comes from the action's live role guard, never from submitted fields. */
export async function changeRequestStatus(actor: { userId: string; canOverride: boolean }, input: StatusChangeCommand) {
  const { requestIds, newStatus, cancelReason: reason, overrideReason, isOverride, sendCorrectionEmail: shouldSendCorrection, confirmCashCollected } = input;
  if (isOverride && !actor.canOverride) throw new StatusChangeError("Forbidden: Administrator override required.");
  if (isOverride && (!overrideReason || overrideReason.length < 5)) throw new StatusChangeError("An override reason of at least 5 characters is required.");
  if (shouldSendCorrection && !isOverride) throw new StatusChangeError("Correction emails require an administrator override.");
  if (newStatus === "CANCELLED" && !reason) throw new StatusChangeError("A cancellation reason is required.");
  const versions = new Map(input.expectedVersions.map(version => [version.id, new Date(version.updatedAt)]));
  const changes = await prisma.$transaction(async tx => {
    const requests = await tx.request.findMany({ where: { id: { in: requestIds } }, include: { identityReview: { select: identityReviewSelect } } });
    if (requests.length !== requestIds.length) throw new StatusChangeError("One or more requests no longer exist. Refresh the queue.");
    for (const request of requests) {
      if (request.updatedAt.getTime() !== versions.get(request.id)?.getTime()) throw new StatusChangeError("Requests changed. Refresh the queue and try again.");
      const error = getStatusChangeError({ ...request, identityVerified: hasVerifiedRequestIdentity(request) }, newStatus, { isOverride, confirmCashCollected });
      if (error) throw new StatusChangeError(error);
    }
    const updated = [];
    const settings = requests.some(request => !isStatusReversal(request.status, newStatus) || shouldSendCorrection) ? await loadNotificationSettings(tx) : [];
    for (const request of requests.sort((a, b) => a.id.localeCompare(b.id))) {
      const saved = await tx.request.update({ where: { id: request.id, updatedAt: request.updatedAt, status: request.status, paymentStatus: request.paymentStatus,
        paymentMethod: request.paymentMethod, paymongoPaymentId: request.paymongoPaymentId }, data: { status: newStatus, cancelReason: newStatus === "CANCELLED" ? reason : null, notificationVersion: { increment: 1 } } });
      const event = await tx.auditLog.create({ data: { adminId: actor.userId, requestId: request.id,
        action: isOverride ? "STATUS_OVERRIDE" : newStatus === "CANCELLED" ? "UPDATE_STATUS_CANCELLED" : "UPDATE_STATUS",
        details: JSON.stringify({ fromStatus: request.status, toStatus: newStatus, isOverride, overrideReason, reason,
          cashCollectedConfirmed: newStatus === "COMPLETED" && request.paymentMethod === "cash" && request.paymentStatus === "CASH_ON_PICKUP" && confirmCashCollected,
          refundRequested: newStatus === "CANCELLED" && request.paymentMethod === "online" && request.paymentStatus === "PAID",
          paymentClosureRequested: newStatus === "CANCELLED" && request.paymentMethod === "online" && request.paymentStatus === "UNPAID" }) } });
      if (newStatus === "COMPLETED" && request.paymentMethod === "cash") await confirmCashCollection(tx, request, event.id, confirmCashCollected);
      if (newStatus === "COMPLETED") await tx.requestCompletion.upsert({ where: { requestId: request.id }, update: {}, create: { requestId: request.id, completedAt: event.createdAt, evidenceId: event.id } });
      if (!isStatusReversal(request.status, newStatus) || shouldSendCorrection) await enqueueRequestNotification(tx, saved, event.id, shouldSendCorrection, settings);
      updated.push({ before: request, after: saved });
    }
    return updated;
  }, { maxWait: 2000, timeout: 8000 });
  scheduleNotificationDelivery();
  const { reviewIds } = newStatus === "CANCELLED" ? await finishCancellationRefunds(changes.map(change => change.before), actor.userId, reason!) : { reviewIds: [] };
  return { success: true as const, changes: changes.map(({ after }) => ({ id: after.id, status: after.status, paymentStatus: after.paymentStatus, cancelReason: after.cancelReason, updatedAt: after.updatedAt.toISOString() })),
    warning: reviewIds.length ? `${reviewIds.length} cancelled request(s) need payment closure or refund reconciliation. Use the administrator payment review; do not issue another refund blindly.` : undefined };
}
