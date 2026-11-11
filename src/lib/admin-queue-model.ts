import { z } from "zod";
import { csvCell } from "./csv";
import { studentRequestSchema, toStudentRequest, type StudentRequestRow } from "./student-request-model";

export const ADMIN_QUEUE_URL = "/api/admin/requests?format=queue-v1";
export const QUEUE_PAGE_SIZE = 10;
export const queueItemSchema = studentRequestSchema.extend({ studentName: z.string(), studentNumber: z.string(), studentEmail: z.string().nullable() });
export const adminQueueSchema = z.object({
  actorId: z.string().min(1), role: z.enum(["admin", "employee"]),
  emailLookupFailed: z.boolean(), items: z.array(queueItemSchema),
}).refine(queue => new Set(queue.items.map(item => item.id)).size === queue.items.length, "Duplicate requests");
export type QueueItem = z.infer<typeof queueItemSchema>;
export type AdminQueue = z.infer<typeof adminQueueSchema>;
export type QueueSort = { key: "studentName" | "documentType" | "paymentStatus" | "updatedAt" | "status"; direction: "asc" | "desc" };
export type QueueFilter = "ALL" | QueueItem["status"];
export const queueStatusLabels = { PENDING_PAYMENT: "Pending Payment", PROCESSING: "Processing", READY_FOR_PICKUP: "Ready for Pickup", COMPLETED: "Completed", CANCELLED: "Cancelled" };
export const adminQueueSelect = {
  id: true, studentId: true, studentName: true, studentNumber: true, documentType: true, purpose: true,
  paymentMethod: true, paymentStatus: true, status: true, cancelReason: true, createdAt: true, updatedAt: true,
} as const;
export function toQueueItem(row: StudentRequestRow & { studentName: string; studentNumber: string }, email: string | null, label?: string): QueueItem {
  return { ...toStudentRequest(row, label), studentName: row.studentName, studentNumber: row.studentNumber, studentEmail: email };
}
export function queueView(items: QueueItem[], filter: QueueFilter, search: string, sort: QueueSort, requestedPage: number) {
  const q = search.trim().toLowerCase();
  const filtered = items.filter(item => (filter === "ALL" || item.status === filter) && (!q ||
    [item.id, item.documentType, item.studentName, item.studentNumber, item.studentEmail ?? "", item.purpose.replace(/_/g, " "),
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
  const header = ["Reference ID", "Student Name", "Student Number", "Student Email", "Document", "Purpose", "Payment Method", "Payment Status", "Date", "Status", "Cancel Reason"];
  return [header, ...items.map(item => [item.id, item.studentName, item.studentNumber, item.studentEmail, item.documentType,
    item.purpose, item.paymentMethod, item.paymentStatus, item.createdAt, item.status, item.cancelReason])]
    .map(row => row.map(csvCell).join(",")).join("\r\n");
}
