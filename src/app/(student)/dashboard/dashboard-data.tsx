import { requireStudent } from "@/lib/auth";
import { RequestList } from "./request-list";
import { loadStudentHistory } from "@/lib/student-request-data";

export async function DashboardData({ userId, isMaintenanceMode }: { userId: string; isMaintenanceMode: boolean }) {
  if (await requireStudent() !== userId) throw new Error("Forbidden: Account changed.");
  const history = await loadStudentHistory(userId);
  return <RequestList history={history} isMaintenanceMode={isMaintenanceMode} />;
}
