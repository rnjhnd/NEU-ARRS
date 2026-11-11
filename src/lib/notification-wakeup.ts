import { after } from "next/server";
import { deliverNotificationOutbox } from "./notification-worker";

export function scheduleNotificationDelivery() {
  try {
    after(async () => {
      try { await deliverNotificationOutbox(); }
      catch { console.error("[Notifications] Durable queue needs a later worker run."); }
    });
  } catch { console.error("[Notifications] Immediate wake-up unavailable; durable queue retained."); }
}
