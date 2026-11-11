import { adminQueueSchema } from "./admin-queue-model";

export class QueueRefreshError extends Error {
  constructor(readonly status: number) { super("Queue could not be refreshed."); }
}
export async function fetchAdminQueue([url, actorId, role]: readonly [string, string, string]) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (response.redirected) throw new QueueRefreshError(401);
  if (!response.ok) throw new QueueRefreshError(response.status);
  const queue = adminQueueSchema.safeParse(await response.json());
  if (!queue.success) throw new QueueRefreshError(502);
  if (queue.data.actorId !== actorId || queue.data.role !== role) throw new QueueRefreshError(403);
  return queue.data;
}
