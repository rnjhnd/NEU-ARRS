import { rejectUnauthorizedCron } from "@/lib/cron-auth";
import { cleanupUnpaidRequests } from "@/lib/cleanup-unpaid";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  try {
    const result = await cleanupUnpaidRequests();
    console.info("[Cleanup] Run completed", result);
    return Response.json(result, { status: result.success ? 200 : 500, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Cleanup] Run failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ success: false, error: "Cleanup could not be completed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
