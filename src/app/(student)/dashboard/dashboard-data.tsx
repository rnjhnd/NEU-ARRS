import { requireStudent } from "@/lib/auth";
import { RequestList } from "./request-list";
import { getSystemSetting } from "@/app/actions/admin.actions";
import { loadStudentHistory } from "@/lib/student-request-data";

export async function DashboardData({ userId }: { userId: string }) {
  if (await requireStudent() !== userId) throw new Error("Forbidden: Account changed.");
  const [history, maintenanceSetting] = await Promise.all([
    loadStudentHistory(userId), getSystemSetting("MAINTENANCE_MODE"),
  ]);
  return <RequestList history={history} isMaintenanceMode={!maintenanceSetting.success || maintenanceSetting.value === "true"} />;
}
