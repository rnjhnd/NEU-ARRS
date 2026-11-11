import { NextResponse } from "next/server";
import { getAdminQueueActor, loadAdminQueue, QueueAccessError } from "@/lib/admin-queue-data";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.get("format") !== "queue-v1") {
      await getAdminQueueActor();
      return NextResponse.json({ error: "Reload the staff queue." }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json(await loadAdminQueue(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof QueueAccessError ? error.status : 500;
    if (status === 500) console.error("[ADMIN_REQUESTS_GET]", { error: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: status === 500 ? "Queue unavailable." : "Staff authorization required." }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
