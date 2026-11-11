import { z } from "zod";
import type { Request } from "@prisma/client";

export const studentRequestSchema = z.object({
  id: z.string().min(1), documentType: z.string(), purpose: z.enum(["EMPLOYMENT", "BOARD_EXAM", "TRANSFER", "SCHOLARSHIP", "PERSONAL", "OTHER"]),
  paymentMethod: z.string(), paymentStatus: z.enum(["UNPAID", "PAID", "CASH_ON_PICKUP", "REFUNDED"]),
  status: z.enum(["PENDING_PAYMENT", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"]),
  cancelReason: z.string().nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const REQUEST_PAGE_SIZE = 10;
export const historyQuerySchema = z.object({
  page: z.number().int().min(1).max(100_000).default(1),
  sort: z.enum(["id", "documentType", "purpose", "updatedAt", "paymentStatus", "status"]).default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export const DEFAULT_HISTORY_QUERY = historyQuerySchema.parse({});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export const historySummarySchema = z.object({ total: z.number().int().nonnegative(), active: z.number().int().nonnegative(), completed: z.number().int().nonnegative() });
export const studentHistorySchema = z.object({
  studentId: z.string().min(1), items: z.array(studentRequestSchema).max(REQUEST_PAGE_SIZE),
  summary: historySummarySchema, query: historyQuerySchema, totalPages: z.number().int().positive(),
}).superRefine((history, ctx) => {
  const { total, active, completed } = history.summary;
  const pages = Math.max(1, Math.ceil(total / REQUEST_PAGE_SIZE));
  const expected = Math.min(REQUEST_PAGE_SIZE, Math.max(0, total - (history.query.page - 1) * REQUEST_PAGE_SIZE));
  if (active + completed > total || history.totalPages !== pages || history.query.page > pages || history.items.length !== expected || new Set(history.items.map(item => item.id)).size !== history.items.length) {
    ctx.addIssue({ code: "custom", message: "Inconsistent history page" });
  }
});
export type StudentRequest = z.infer<typeof studentRequestSchema>;
export type StudentHistory = z.infer<typeof studentHistorySchema>;
export type RequestSortKey = HistoryQuery["sort"];
export type RequestSort = { key: RequestSortKey; direction: "asc" | "desc" };
export const STUDENT_HISTORY_URL = "/api/student/requests?format=history-v2";
export const ACTIVE_HISTORY_REFRESH_MS = 30_000;
export function studentHistoryURL(query: HistoryQuery) {
  return STUDENT_HISTORY_URL + "&" + new URLSearchParams({ page: String(query.page), sort: query.sort, direction: query.direction });
}
export function historyRefreshInterval(history?: StudentHistory) {
  return history && history.summary.active > 0 ? ACTIVE_HISTORY_REFRESH_MS : 0;
}

export type StudentRequestRow = Pick<Request, "id" | "documentType" | "purpose" | "paymentMethod" | "paymentStatus" | "status" | "cancelReason" | "createdAt" | "updatedAt">;
export const legacyDocumentLabels: Record<string, string> = {
  TRANSCRIPT_OF_RECORDS: "Transcript of Records", GOOD_MORAL: "Good Moral Certificate",
  LEAVE_OF_ABSENCE: "Leave of Absence", TRUE_COPY_OF_GRADES: "True Copy of Grades",
  CERTIFICATE_OF_ENROLLMENT: "Certificate of Enrollment", DIPLOMA: "Diploma",
};
export function toStudentRequest(row: StudentRequestRow, label?: string): StudentRequest {
  return {
    id: row.id, documentType: label ?? legacyDocumentLabels[row.documentType] ?? row.documentType.replace(/_/g, " "),
    purpose: row.purpose, paymentMethod: row.paymentMethod, paymentStatus: row.paymentStatus, status: row.status,
    cancelReason: row.cancelReason, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export function mergeCancelledRequest(history: StudentHistory, saved: StudentRequest): StudentHistory {
  const before = history.items.find(item => item.id === saved.id);
  if (!before || Date.parse(saved.updatedAt) < Date.parse(before.updatedAt)) return history;
  const active = (item: StudentRequest) => item.status !== "CANCELLED" && item.status !== "COMPLETED" ? 1 : 0;
  return { ...history, items: history.items.map(item => item.id === saved.id ? saved : item), summary: {
    ...history.summary, active: history.summary.active + active(saved) - active(before),
    completed: history.summary.completed + Number(saved.status === "COMPLETED") - Number(before.status === "COMPLETED"),
  } };
}
