"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { queueNotificationRetry } from "@/lib/services/notification-retry";
import { scheduleNotificationDelivery } from "@/lib/notification-wakeup";

export async function retryNotification(formData: FormData) {
  try {
    const actorId = await requireAdmin();
    const parsed = z.object({ id: z.string().cuid(), version: z.iso.datetime(), reason: z.string().trim().min(5).max(1000) })
      .safeParse({ id: formData.get("id"), version: formData.get("version"), reason: formData.get("reason") });
    if (!parsed.success) return { success: false, message: "A notification, matching version, and reason are required." };
    return await queueNotificationRetry(actorId, parsed.data);
  } catch { return { success: false, message: "Notification could not be queued. Refresh and check its delivery record." }; }
}

export async function wakeNotificationWorker() {
  try { await requireAdmin(); scheduleNotificationDelivery(); return { success: true }; }
  catch { return { success: false }; }
}
