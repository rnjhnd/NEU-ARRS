import { withVerifiedPage } from "@/components/verified-page";
import { getVerifiedAccount, requireStudent } from "@/lib/auth";
import { Suspense } from "react";
import { getRequestSetting } from "@/lib/configuration-data";
import { DashboardData } from "./dashboard-data";
import { DashboardShell, DashboardSkeleton } from "./page-shell";

async function StudentDashboardPage() {
  const userId = await requireStudent();
  const [account, maintenanceSetting] = await Promise.all([getVerifiedAccount(), getRequestSetting("MAINTENANCE_MODE")]);
  const isMaintenanceMode = !maintenanceSetting.success || maintenanceSetting.value === "true";
  return <DashboardShell firstName={account.profile.firstName || "Student"} isMaintenanceMode={isMaintenanceMode}>
    <Suspense fallback={<DashboardSkeleton />}><DashboardData userId={userId} isMaintenanceMode={isMaintenanceMode} /></Suspense>
  </DashboardShell>;
}

export default withVerifiedPage(StudentDashboardPage, ["student"]);
