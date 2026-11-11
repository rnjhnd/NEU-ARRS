import { studentHistorySchema } from "./student-request-model";

export class HistoryRefreshError extends Error {
  constructor(readonly status: number, message = "Request history could not be refreshed.") { super(message); }
}
export async function fetchStudentHistory([url, studentId]: readonly [string, string]) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (response.redirected) throw new HistoryRefreshError(401);
  if (!response.ok) throw new HistoryRefreshError(response.status);
  const parsed = studentHistorySchema.safeParse(await response.json());
  if (!parsed.success) throw new HistoryRefreshError(502);
  if (parsed.data.studentId !== studentId) throw new HistoryRefreshError(401, "Your account changed. Refresh the page before continuing.");
  const params = new URL(url, "https://history.invalid").searchParams;
  const requestedPage = Number(params.get("page") ?? 1);
  if (parsed.data.query.page !== Math.min(requestedPage, parsed.data.totalPages) || parsed.data.query.sort !== (params.get("sort") ?? "updatedAt") || parsed.data.query.direction !== (params.get("direction") ?? "desc")) {
    throw new HistoryRefreshError(502);
  }
  return parsed.data;
}
