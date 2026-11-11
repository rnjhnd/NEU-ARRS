import { FinanceLoadError, loadFinanceData, requireFinanceActor } from "@/lib/finance-data";
import { FinanceClient } from "./finance-client";
import type { FinanceDataset } from "@/lib/finance-model";

export async function FinanceData() {
  const actorId = await requireFinanceActor();
  let initialData: FinanceDataset | undefined;
  let initialError: string | undefined;
  try { initialData = await loadFinanceData(); }
  catch (error) {
    if (error instanceof FinanceLoadError && [401, 403].includes(error.status)) throw error;
    console.error("[FINANCE_INITIAL]", { error: error instanceof Error ? error.name : "UnknownError" });
    initialError = "Finance snapshot unavailable.";
  }
  return <FinanceClient actorId={actorId} initialData={initialData} initialError={initialError} />;
}
