import { getAdminQueueActor, loadQueueExport, QueueLoadError } from "@/lib/admin-queue-data";
import { queueExportSchema } from "@/lib/admin-queue-model";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, allowed = ["format", "from", "to"];
    const parsed = queueExportSchema.safeParse({ from: params.get("from") ?? undefined, to: params.get("to") ?? undefined });
    if (params.get("format") !== "queue-export-v1" || !parsed.success || allowed.some(key => params.getAll(key).length > 1) || [...params.keys()].some(key => !allowed.includes(key))) {
      await getAdminQueueActor(); return Response.json({ error: "Choose a valid export date range." }, { status: 400, headers });
    }
    const result = await loadQueueExport(parsed.data);
    return new Response(result.csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="neu_requests_export_' + new Date().toISOString().slice(0, 10) + '.csv"',
      "X-Queue-Actor": result.actorId, "X-Queue-Role": result.role, "X-Queue-Email-Lookup-Failed": String(Number(result.emailLookupFailed)) } });
  } catch (error) {
    return Response.json({ error: error instanceof QueueLoadError ? error.message : "Queue export unavailable. Try again later." }, { status: error instanceof QueueLoadError ? error.status : 500, headers });
  }
}
