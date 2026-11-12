import { NextResponse } from "next/server";
import { getAdminQueueActor, loadAdminQueue, QueueLoadError } from "@/lib/admin-queue-data";
import { queueQuerySchema } from "@/lib/admin-queue-model";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("format") !== "queue-v2") { await getAdminQueueActor(); return NextResponse.json({ error: "Reload the staff queue." }, { status: 409, headers }); }
    const parsed = queueQuerySchema.safeParse({ page: params.has("page") ? /^\d{1,7}$/.test(params.get("page")!) ? Number(params.get("page")) : NaN : undefined,
      status: params.get("status") ?? undefined, search: params.get("search") ?? undefined, sort: params.get("sort") ?? undefined, direction: params.get("direction") ?? undefined });
    const allowed = ["format", "page", "status", "search", "sort", "direction"];
    if (!parsed.success || allowed.some(key => params.getAll(key).length > 1) || [...params.keys()].some(key => !allowed.includes(key))) {
      await getAdminQueueActor(); return NextResponse.json({ error: "Invalid queue query." }, { status: 400, headers });
    }
    return NextResponse.json(await loadAdminQueue(parsed.data), { headers });
  } catch (error) {
    const status = error instanceof QueueLoadError ? error.status : 500;
    return NextResponse.json({ error: error instanceof QueueLoadError ? error.message : "Queue unavailable." }, { status, headers });
  }
}
