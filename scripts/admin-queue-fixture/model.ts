import { DEFAULT_QUEUE_QUERY, queueView, type AdminQueue, type QueueItem, type QueueQuery } from "../../src/lib/admin-queue-model";
export type QueueSource = Pick<AdminQueue, "actorId" | "role" | "emailLookupFailed"> & { items: QueueItem[] };
// Independent in-memory reference for synthetic browser responses only.
export function fixtureQueue(source: QueueSource, query: QueueQuery = DEFAULT_QUEUE_QUERY): AdminQueue {
  const view = queueView(source.items, query.status, query.search, { key: query.sort, direction: query.direction }, query.page);
  return { ...source, items: view.items, query: { ...query, page: view.page }, total: view.total, totalPages: view.totalPages,
    summary: { total: source.items.length, pending: source.items.filter(i => i.status === "PENDING_PAYMENT").length, processing: source.items.filter(i => i.status === "PROCESSING").length, ready: source.items.filter(i => i.status === "READY_FOR_PICKUP").length } };
}
