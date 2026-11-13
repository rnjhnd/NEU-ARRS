import Link from "next/link";
import { Suspense } from "react";
import { requireFinanceActor, FinanceLoadError } from "@/lib/finance-data";
import { loadMoneyMovements } from "@/lib/money-movement-data";
import type { MovementDataset } from "@/lib/money-movement-model";
import { MovementClient } from "./movement-client";
export const metadata = { title: "Money Movements" };
async function MovementData() {
  const actorId = await requireFinanceActor();
  let data: MovementDataset | undefined;
  try { data = await loadMoneyMovements(); }
  catch (error) {
    if (error instanceof FinanceLoadError && [401, 403].includes(error.status)) throw error;
    console.error("[MOVEMENTS_INITIAL]", { error: error instanceof Error ? error.name : "UnknownError" });
  }
  return <MovementClient actorId={actorId} initialData={data} />;
}
export default async function MovementPage() {
  await requireFinanceActor();
  return <main className="space-y-6"><header className="space-y-2"><h1 className="text-3xl font-bold">Money Movements</h1><Link href="/admin/finance" className="underline">Settled Request Values — submitted-date report</Link></header><Suspense fallback={<p role="status">Loading money movements...</p>}><MovementData /></Suspense></main>;
}
