"use server";

import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { NOTIFICATION_RETRY_WINDOW_MS, notificationCredentialFingerprint } from "@/lib/notification-worker";
import { scheduleNotificationDelivery } from "@/lib/notification-wakeup";

export async function retryNotification(formData: FormData) {
  try {
    const actorId = await requireAdmin();
    const parsed = z.object({ id: z.string().cuid(), version: z.iso.datetime(), reason: z.string().trim().min(5).max(1000) })
      .safeParse({ id: formData.get("id"), version: formData.get("version"), reason: formData.get("reason") });
    if (!parsed.success) return { success: false, message: "A notification, matching version, and reason are required." };
    const row = await prisma.notificationOutbox.findUnique({ where: { id: parsed.data.id } });
    if (!row || !["QUEUED", "REVIEW"].includes(row.state) || row.updatedAt.toISOString() !== parsed.data.version) return { success: false, message: "Notification changed or cannot be retried. Refresh the queue." };
    if (row.firstAttemptAt && (row.firstAttemptAt > new Date() || Date.now() - row.firstAttemptAt.getTime() >= NOTIFICATION_RETRY_WINDOW_MS ||
        row.credentialFingerprint !== notificationCredentialFingerprint())) {
      return { success: false, message: "The original send result needs provider reconciliation. Its key and payload cannot be reset." };
    }
    await prisma.$transaction(async tx => {
      await tx.notificationOutbox.update({ where: { id: row.id, updatedAt: row.updatedAt, state: row.state },
        data: { state: "QUEUED", nextAttemptAt: new Date(), retryLimit: row.attempts + 5, lastError: null } });
      await tx.auditLog.create({ data: { adminId: actorId, action: "NOTIFICATION_RETRY_REQUESTED", requestId: row.requestId,
        details: JSON.stringify({ notificationId: row.id, reason: parsed.data.reason, attempts: row.attempts }) } });
    }, { maxWait: 2000, timeout: 5000 });
    scheduleNotificationDelivery();
    return { success: true, message: "Notification queued with its original identity and payload." };
  } catch { return { success: false, message: "Notification could not be queued. Refresh and check its delivery record." }; }
}

export async function wakeNotificationWorker() {
  try { await requireAdmin(); scheduleNotificationDelivery(); return { success: true }; }
  catch { return { success: false }; }
}
