import { StudentsShell, StudentsSkeleton } from "./page-shell";
import { withVerifiedPage } from "@/components/verified-page";
import { requireEmployeeOrAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { StudentsData } from "./students-data";

export const metadata = { title: "Student Directory" };

async function StudentsPage() {
  await requireEmployeeOrAdmin();

  return (
    <StudentsShell>

      <Suspense fallback={<StudentsSkeleton />}>
        <StudentsData />
      </Suspense>
    </StudentsShell>
  );
}

export default withVerifiedPage(StudentsPage, ["admin", "employee"]);
