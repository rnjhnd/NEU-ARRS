import { CommandCenterShell, AdminQueueSkeleton } from "./page-shell";
import { withVerifiedPage } from "@/components/verified-page";
import { requireEmployeeOrAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { AdminQueueData } from "./admin-queue-data";

async function AdminPage() {
  await requireEmployeeOrAdmin();

  return (
    <CommandCenterShell>

      <Suspense fallback={<AdminQueueSkeleton />}>
        <AdminQueueData />
      </Suspense>
    </CommandCenterShell>
  );
}

export default withVerifiedPage(AdminPage, ["admin", "employee"]);
