import { z } from "zod";
import { csvCell } from "./csv";
import { studentRequestSchema, toStudentRequest, type StudentRequestRow } from "./student-request-model";
import { hasVerifiedRequestIdentity, identityReviewSelect, type ReviewedRequest } from "./request-identity";

export const ADMIN_QUEUE_URL = "/api/admin/requests?format=queue-v3";
export const QUEUE_PAGE_SIZE = 10;
export const QUEUE_EXPORT_LIMIT = 5000;
export const QUEUE_RESPONSE_BYTES = 5_000_000;
export const queueQuerySchema = z.object({ page: z.number().int().min(1).max(1_000_000).default(1),
  status: z.enum(["ALL", "PENDING_PAYMENT", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"]).default("ALL"),
  search: z.string().trim().max(200).default(""), sort: z.enum(["studentName", "documentLabel", "paymentStatus", "updatedAt", "status"]).default("updatedAt"), direction: z.enum(["asc", "desc"]).default("desc") }).strict();
export type QueueQuery = z.infer<typeof queueQuerySchema>;
export const DEFAULT_QUEUE_QUERY = queueQuerySchema.parse({});
export const queueExportSchema = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }).strict()
  .refine(q => Boolean(q.from) === Boolean(q.to) && (!q.from || q.from <= q.to!), "Choose a valid creation-date range.");
export type QueueExportQuery = z.infer<typeof queueExportSchema>;
export function adminQueueURL(query: QueueQuery) {
  const params = new URLSearchParams({ format: "queue-v3" });
  for (const key of ["page", "status", "search", "sort", "direction"] as const) if (query[key] !== DEFAULT_QUEUE_QUERY[key]) params.set(key, String(query[key]));
  return "/api/admin/requests?" + params;
}
export const queueItemSchema = studentRequestSchema.extend({ studentName: z.string(), studentNumber: z.string(), studentEmail: z.string().nullable(),
  identityVerified: z.boolean().default(false), identityVerifiedAt: z.iso.datetime().nullable().default(null) })
  .refine(item => item.identityVerified === (item.identityVerifiedAt !== null), "Inconsistent identity attestation");
export const adminQueueSchema = z.object({
  actorId: z.string().min(1), role: z.enum(["admin", "employee"]),
  query: queueQuerySchema, total: z.number().int().nonnegative(), totalPages: z.number().int().min(1),
  summary: z.object({ total: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), processing: z.number().int().nonnegative(), ready: z.number().int().nonnegative() }).strict(),
  emailLookupFailed: z.boolean(), items: z.array(queueItemSchema).max(QUEUE_PAGE_SIZE),
}).strict().refine(queue => new Set(queue.items.map(item => item.id)).size === queue.items.length && queue.query.page <= queue.totalPages && queue.totalPages === Math.max(1, Math.ceil(queue.total / QUEUE_PAGE_SIZE)) && queue.total <= queue.summary.total && queue.items.length === Math.min(QUEUE_PAGE_SIZE, Math.max(0, queue.total - (queue.query.page - 1) * QUEUE_PAGE_SIZE)) && queue.summary.pending + queue.summary.processing + queue.summary.ready <= queue.summary.total, "Invalid page or duplicate requests");
export type QueueItem = z.infer<typeof queueItemSchema>;
export type AdminQueue = z.infer<typeof adminQueueSchema>;
export type QueueSort = { key: "studentName" | "documentLabel" | "paymentStatus" | "updatedAt" | "status"; direction: "asc" | "desc" };
export type QueueFilter = "ALL" | QueueItem["status"];
export const queueStatusLabels = { PENDING_PAYMENT: "Pending Payment", PROCESSING: "Processing", READY_FOR_PICKUP: "Ready for Pickup", COMPLETED: "Completed", CANCELLED: "Cancelled" };
export const adminQueueSelect = {
  id: true, studentId: true, studentName: true, studentNumber: true, documentType: true, purpose: true,
  paymentMethod: true, paymentStatus: true, status: true, cancelReason: true, createdAt: true, updatedAt: true,
  identityReview: { select: identityReviewSelect },
} as const;
export function toQueueItem(row: StudentRequestRow & ReviewedRequest, email: string | null, label?: string): QueueItem {
  const identityVerified = hasVerifiedRequestIdentity(row);
  return { ...toStudentRequest(row, label), studentName: row.studentName, studentNumber: row.studentNumber, studentEmail: email,
    identityVerified, identityVerifiedAt: identityVerified ? row.identityReview!.verifiedAt.toISOString() : null };
}
export function queueView(items: QueueItem[], filter: QueueFilter, search: string, sort: QueueSort, requestedPage: number) {
  const q = search.trim().toLowerCase();
  const filtered = items.filter(item => (filter === "ALL" || item.status === filter) && (!q ||
    [item.id, item.documentLabel, item.studentName, item.studentNumber, item.studentEmail ?? "", item.purpose.replace(/_/g, " "),
      item.paymentMethod, item.paymentStatus.replace(/_/g, " ")].some(value => value.toLowerCase().includes(q))));
  filtered.sort((a, b) => {
    const left = sort.key === "updatedAt" ? Date.parse(a.updatedAt) : a[sort.key].toLowerCase();
    const right = sort.key === "updatedAt" ? Date.parse(b.updatedAt) : b[sort.key].toLowerCase();
    return (left < right ? -1 : left > right ? 1 : 0) * (sort.direction === "asc" ? 1 : -1) || a.id.localeCompare(b.id);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / QUEUE_PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, requestedPage));
  return { items: filtered.slice((page - 1) * QUEUE_PAGE_SIZE, page * QUEUE_PAGE_SIZE), page, totalPages, total: filtered.length };
}
export function queueSnapshotChanged(snapshot: QueueItem[], current: QueueItem[]) {
  const versions = new Map(current.map(item => [item.id, item.updatedAt]));
  return snapshot.some(item => versions.get(item.id) !== item.updatedAt);
}
export type QueueChange = Pick<QueueItem, "id" | "status" | "paymentStatus" | "cancelReason" | "updatedAt">;
export function mergeQueueChanges(queue: AdminQueue, changes: QueueChange[]): AdminQueue {
  const byId = new Map(changes.map(change => [change.id, change]));
  return { ...queue, items: queue.items.map(item => {
    const saved = byId.get(item.id);
    return saved && Date.parse(saved.updatedAt) >= Date.parse(item.updatedAt) ? { ...item, ...saved } : item;
  }) };
}

export function queueCSV(items: QueueItem[]) {
  const header = ["Reference ID", "Student Name", "Student Number", "Student Email", "Document Type ID", "Document Label", "Purpose", "Payment Method", "Payment Status", "Date", "Status", "Cancel Reason"];
  return [header, ...items.map(item => [item.id, item.studentName, item.studentNumber, item.studentEmail, item.documentTypeId, item.documentLabel,
    item.purpose, item.paymentMethod, item.paymentStatus, item.createdAt, item.status, item.cancelReason])]
    .map(row => row.map(csvCell).join(",")).join("\r\n");
}
