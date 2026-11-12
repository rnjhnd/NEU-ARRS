import { adminQueueSchema, QUEUE_RESPONSE_BYTES, type QueueExportQuery } from "./admin-queue-model";

export class QueueRefreshError extends Error {
  constructor(readonly status: number) { super("Queue could not be refreshed."); }
}
export async function fetchAdminQueue([url, actorId, role]: readonly [string, string, string]) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (response.redirected) throw new QueueRefreshError(401);
  if (!response.ok) throw new QueueRefreshError(response.status);
  const queue = adminQueueSchema.safeParse(await response.json());
  if (!queue.success) throw new QueueRefreshError(502);
  if (queue.data.actorId !== actorId || queue.data.role !== role) throw new QueueRefreshError(403);
  return queue.data;
}
export async function fetchQueueExport(actorId: string, role: string, query: QueueExportQuery, signal: AbortSignal) {
  const params = new URLSearchParams({ format: "queue-export-v1", ...query });
  const response = await fetch("/api/admin/requests/export?" + params, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
  if (response.redirected) throw new QueueRefreshError(401);
  if (!response.ok) {
    const error = new QueueRefreshError(response.status);
    error.message = response.status === 413 ? "Export is too large. Choose a shorter creation-date range." : response.status === 400 ? "Choose a valid creation-date range." : "Export could not be verified. Refresh before retrying.";
    throw error;
  }
  if (response.headers.get("X-Queue-Actor") !== actorId || response.headers.get("X-Queue-Role") !== role) throw new QueueRefreshError(403);
  if (!response.headers.get("Content-Type")?.startsWith("text/csv")) throw new QueueRefreshError(502);
  const csv = await response.text();
  if (new TextEncoder().encode(csv).length > QUEUE_RESPONSE_BYTES || !csv.replace(/^\uFEFF/, "").startsWith('"Reference ID",')) throw new QueueRefreshError(502);
  return { csv, emailLookupFailed: response.headers.get("X-Queue-Email-Lookup-Failed") === "1" };
}
