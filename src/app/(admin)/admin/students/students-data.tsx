import { DirectoryLoadError, loadStudentDirectory, requireDirectoryActor } from "@/lib/student-directory-data";
import { StudentClient } from "./student-client";
import type { StudentDirectory } from "@/lib/student-directory-model";

export async function StudentsData() {
  const actor = await requireDirectoryActor();
  let data: StudentDirectory | undefined;
  let initialError: string | undefined;
  try {
    data = await loadStudentDirectory();
  } catch (error) {
    // Do not render empty counts as though they were a successful directory read.
    console.error("[DIRECTORY_INITIAL]", { error: error instanceof Error ? error.name : "UnknownError" });
    initialError = error instanceof DirectoryLoadError ? error.message : "Student directory unavailable. Refresh to try again.";
  }
  return <StudentClient {...actor} initialData={data} initialError={initialError} />;
}
