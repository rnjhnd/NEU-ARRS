import { NextResponse } from "next/server";
import { requireFinanceActor, FinanceLoadError } from "@/lib/finance-data";
import { movementQuerySchema } from "@/lib/money-movement-model";
import { loadMoneyMovements } from "@/lib/money-movement-data";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    await requireFinanceActor();
    const params = new URL(request.url).searchParams;
    const allowed = ["format", "period", "from", "to", "undatedPage"];
    if ([...params.keys()].some(key => !allowed.includes(key)) || allowed.some(key => params.getAll(key).length > 1)) return NextResponse.json({ error: "Invalid report controls." }, { status: 400, headers });
    if (params.get("format") !== "money-movements-v2") return NextResponse.json({ error: "Reload the money-movement report." }, { status: 409, headers });
    const query = movementQuerySchema.safeParse({ period: params.get("period") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, undatedPage: Number(params.get("undatedPage") ?? 1) });
    if (!query.success) return NextResponse.json({ error: "Invalid report period or page." }, { status: 400, headers });
    return NextResponse.json(await loadMoneyMovements(query.data), { headers });
  } catch (error) {
    const status = error instanceof FinanceLoadError ? error.status : 500;
    if (status === 500) console.error("[MOVEMENTS_GET]", { error: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: status === 413 ? "Too many movements. Choose a shorter period." : "Money movements unavailable." }, { status, headers });
  }
}
