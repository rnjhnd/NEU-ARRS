import { z } from "zod";
import { Purpose, RequestStatus } from "@prisma/client";

const createSchema = z.object({ submissionKey: z.string().uuid(), studentName: z.string().trim().min(2).max(200),
  studentNumber: z.string().regex(/^\d{2}-\d{5}-\d{3}$/), documentTypeId: z.string().trim().min(1).max(100),
  purpose: z.enum(Purpose), paymentMethod: z.enum(["online", "cash"]) });
export type CreateRequestCommand = z.infer<typeof createSchema>;
export function parseCreateRequest(form: FormData) {
  const fields = ["submissionKey", "studentName", "studentNumber", "documentType", "purpose", "paymentMethod"];
  if (!(form instanceof FormData)) return { success: false as const, error: "Invalid request form." };
  if (fields.some(key => form.getAll(key).length !== 1)) return { success: false as const, error: "Invalid request fields." };
  // The established form transport calls the catalog ID documentType. Only
  // persistence/transport adapters use that name; a label never enters a quote.
  const parsed = createSchema.safeParse({ ...Object.fromEntries(fields.map(key => [key, form.get(key)])), documentTypeId: form.get("documentType") });
  return parsed.success ? { success: true as const, data: parsed.data } : { success: false as const, error: "Invalid form data. Refresh the form and check your student details." };
}
export const cancelRequestSchema = z.object({ id: z.string().cuid(), reason: z.string().trim().min(1).max(1000) });
export const requestIdSchema = z.string().cuid();

const statusSchema = z.object({
  requestIds: z.array(requestIdSchema).min(1).max(50).refine(ids => new Set(ids).size === ids.length), newStatus: z.nativeEnum(RequestStatus),
  cancelReason: z.string().trim().max(1000).optional(), overrideReason: z.string().trim().max(1000).optional(),
  isOverride: z.enum(["true", "false"]).transform(value => value === "true"),
  sendCorrectionEmail: z.enum(["true", "false"]).transform(value => value === "true"),
  confirmCashCollected: z.enum(["true", "false"]).transform(value => value === "true"),
  expectedVersions: z.array(z.object({ id: requestIdSchema, updatedAt: z.iso.datetime() })).min(1).max(50),
});
export type StatusChangeCommand = z.infer<typeof statusSchema>;
export function parseStatusChange(form: FormData) {
  if (!(form instanceof FormData)) return { success: false as const, error: "Invalid input provided." };
  const requestIds = form.getAll("requestIds"), raw = form.get("expectedVersions");
  if (requestIds.length > 50 || typeof raw !== "string" || raw.length > 8000) return { success: false as const, error: "Invalid input provided. Refresh the queue and try again." };
  let expectedVersions: unknown;
  try { expectedVersions = JSON.parse(raw); } catch { return { success: false as const, error: "Invalid request versions." }; }
  const parsed = statusSchema.safeParse({ requestIds, expectedVersions, newStatus: form.get("newStatus"), cancelReason: form.get("cancelReason") ?? undefined,
    overrideReason: form.get("overrideReason") ?? undefined, isOverride: form.get("isOverride") ?? "false", sendCorrectionEmail: form.get("sendCorrectionEmail") ?? "false", confirmCashCollected: form.get("confirmCashCollected") ?? "false" });
  if (!parsed.success) return { success: false as const, error: "Invalid input provided." };
  const versions = new Map(parsed.data.expectedVersions.map(version => [version.id, version.updatedAt]));
  if (versions.size !== parsed.data.requestIds.length || parsed.data.expectedVersions.length !== parsed.data.requestIds.length || parsed.data.requestIds.some(id => !versions.has(id))) return { success: false as const, error: "A matching version is required for every selected request." };
  return { success: true as const, data: parsed.data };
}
