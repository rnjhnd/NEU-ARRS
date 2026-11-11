import { rejectUnauthorizedCron } from "@/lib/cron-auth";
import { deliverNotificationOutbox } from "@/lib/notification-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  try {
    const result = await deliverNotificationOutbox();
    console.info("[Notifications] Worker completed", result);
    return Response.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[Notifications] Worker needs recovery; no payload logged.");
    return Response.json({ success: false, error: "Notification delivery could not be completed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
