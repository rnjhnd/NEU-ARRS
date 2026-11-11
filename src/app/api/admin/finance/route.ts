import { NextResponse } from "next/server";
import { FinanceLoadError, loadFinanceData, requireFinanceActor } from "@/lib/finance-data";
import { financeQuerySchema } from "@/lib/finance-model";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    await requireFinanceActor();
    const params = new URL(request.url).searchParams;
    if (params.get("format") !== "finance-v2") return NextResponse.json({ error: "Reload the finance dashboard." }, { status: 409, headers });
    const parsed = financeQuerySchema.safeParse({ period: params.get("period") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined });
    if (!parsed.success || ["format", "period", "from", "to"].some(key => params.getAll(key).length > 1)) return NextResponse.json({ error: "Invalid report period." }, { status: 400, headers });
    return NextResponse.json(await loadFinanceData(parsed.data), { headers });
  } catch (error) {
    const status = error instanceof FinanceLoadError ? error.status : 500;
    if (status === 500) console.error("[FINANCE_GET]", { error: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: error instanceof FinanceLoadError ? error.message : "Finance report unavailable." }, { status, headers });
  }
}
