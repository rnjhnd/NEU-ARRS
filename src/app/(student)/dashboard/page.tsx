import { withVerifiedPage } from "@/components/verified-page";
import { currentUser } from "@clerk/nextjs/server";
import { requireStudent } from "@/lib/auth";
import { Suspense } from "react";
import { getRequestSetting } from "@/lib/configuration-data";
import { DashboardData } from "./dashboard-data";
import { DashboardShell, DashboardSkeleton } from "./page-shell";

async function StudentDashboardPage() {
  const userId = await requireStudent();
  const [user, maintenanceSetting] = await Promise.all([currentUser(), getRequestSetting("MAINTENANCE_MODE")]);
  const isMaintenanceMode = !maintenanceSetting.success || maintenanceSetting.value === "true";
  return <DashboardShell firstName={user?.firstName || "Student"} isMaintenanceMode={isMaintenanceMode}>
    <Suspense fallback={<DashboardSkeleton />}><DashboardData userId={userId} /></Suspense>
  </DashboardShell>;
}

export default withVerifiedPage(StudentDashboardPage, ["student"]);
