import "server-only";
import prisma from "../prisma";
import { NOTIFICATION_RETRY_WINDOW_MS, notificationCredentialFingerprint } from "../notification-worker";
import { scheduleNotificationDelivery } from "../notification-wakeup";
export async function queueNotificationRetry(actorId: string, input: { id: string; version: string; reason: string }) {
  const row = await prisma.notificationOutbox.findUnique({ where: { id: input.id } });
  if (!row || !["QUEUED", "REVIEW"].includes(row.state) || row.updatedAt.toISOString() !== input.version) return { success: false, message: "Notification changed or cannot be retried. Refresh the queue." };
  if (row.firstAttemptAt && (row.firstAttemptAt > new Date() || Date.now() - row.firstAttemptAt.getTime() >= NOTIFICATION_RETRY_WINDOW_MS ||
      row.credentialFingerprint !== notificationCredentialFingerprint())) {
    return { success: false, message: "The original send result needs provider reconciliation. Its key and payload cannot be reset." };
  }
  await prisma.$transaction(async tx => {
    await tx.notificationOutbox.update({ where: { id: row.id, updatedAt: row.updatedAt, state: row.state },
      data: { state: "QUEUED", nextAttemptAt: new Date(), retryLimit: row.attempts + 5, lastError: null } });
    await tx.auditLog.create({ data: { adminId: actorId, action: "NOTIFICATION_RETRY_REQUESTED", requestId: row.requestId,
      details: JSON.stringify({ notificationId: row.id, reason: input.reason, attempts: row.attempts }) } });
  }, { maxWait: 2000, timeout: 5000 });
  scheduleNotificationDelivery();
  return { success: true, message: "Notification queued with its original identity and payload." };
}
