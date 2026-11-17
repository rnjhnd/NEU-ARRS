import { withVerifiedPage } from "@/components/verified-page";
import { MovementsShell, MovementsSkeleton } from "./page-shell";
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
async function MovementPage() {
  await requireFinanceActor();
  return <MovementsShell><Suspense fallback={<MovementsSkeleton />}><MovementData /></Suspense></MovementsShell>;
}

export default withVerifiedPage(MovementPage, ["admin"]);
