import { FinanceShell, FinanceSkeleton } from "./page-shell";
import { withVerifiedPage } from "@/components/verified-page";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { FinanceData } from "./finance-data";

async function FinancePage() {
  await requireAdmin();

  return (
    <FinanceShell>

      <Suspense fallback={<FinanceSkeleton />}>
        <FinanceData />
      </Suspense>
    </FinanceShell>
  );
}

export default withVerifiedPage(FinancePage, ["admin"]);
