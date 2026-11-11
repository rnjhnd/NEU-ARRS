import { timingSafeEqual } from "node:crypto";

export const CLEANUP_CRON_PATH = "/api/cron/cleanup-unpaid";
export const NOTIFICATION_CRON_PATH = "/api/cron/deliver-notifications";
export const isServiceCronPath = (path: string) => path === CLEANUP_CRON_PATH || path === NOTIFICATION_CRON_PATH;

/** Used at both the network boundary and the route; a user session is irrelevant. */
export function rejectUnauthorizedCron(request: Request): Response | undefined {
  const secret = process.env.CRON_SECRET;
  const headers = { "Cache-Control": "no-store" };
  if (!secret || secret.trim() !== secret || !secret.trim()) {
    return Response.json({ success: false, error: "Scheduled service is not configured." }, { status: 503, headers });
  }
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401, headers });
  }
  if (request.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers: { ...headers, Allow: "GET" } });
  }
}
