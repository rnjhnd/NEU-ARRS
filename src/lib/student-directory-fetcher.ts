import { directorySchema } from "./student-directory-model";

export class DirectoryRefreshError extends Error {
  constructor(readonly status: number) { super(status === 413
    ? "This directory is too large to load completely. Contact your system administrator."
    : "The student directory could not be refreshed."); }
}
export async function fetchStudentDirectory([url, actorId, role]: readonly [string, string, string]) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (response.redirected) throw new DirectoryRefreshError(401);
  if (!response.ok) throw new DirectoryRefreshError(response.status);
  const directory = directorySchema.safeParse(await response.json());
  if (!directory.success) throw new DirectoryRefreshError(502);
  if (directory.data.actorId !== actorId || directory.data.role !== role) throw new DirectoryRefreshError(403);
  return directory.data;
}
