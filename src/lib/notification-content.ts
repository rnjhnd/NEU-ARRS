import { z } from "zod";
import type { Prisma, Request } from "@prisma/client";
import { defaultEmailTemplates } from "./configuration-defaults.mjs";

export const notificationContentSchema = z.object({
  studentName: z.string().max(200), documentType: z.string().max(100),
  status: z.string().max(64), cancelReason: z.string().max(1000).nullable(),
  customMessage: z.string().max(10000),
});

export function loadNotificationSettings(tx: Prisma.TransactionClient) {
  return tx.systemSettings.findMany({ where: { key: { in: ["OPERATIONS_CONFIG", "EMAIL_TEMPLATES"] } }, select: { key: true, value: true } });
}

export async function enqueueRequestNotification(tx: Prisma.TransactionClient, request: Request, eventId: string, correction = false, snapshot?: { key: string; value: string }[]) {
  const settings = snapshot ?? await loadNotificationSettings(tx);
  let location = "Registrar's Office at Window 4";
  let hours = "8:00 AM to 5:00 PM (Monday-Friday)";
  let templates: Record<string, string> = {};
  for (const setting of settings) {
    try {
      const raw: unknown = JSON.parse(setting.value);
      if (setting.key === "OPERATIONS_CONFIG") {
        const ops = z.object({ location: z.string().trim().min(1).max(500).optional(), hours: z.string().trim().min(1).max(500).optional() }).parse(raw);
        location = ops.location ?? location; hours = ops.hours ?? hours;
      } else templates = z.record(z.string(), z.string().min(1).max(10000)).parse(raw);
    } catch { /* Invalid mail settings use safe defaults; delivery remains queued. */ }
  }
  const defaults: Record<string, string> = defaultEmailTemplates({ location, hours });
  const content = notificationContentSchema.parse({
    studentName: request.studentName.slice(0, 200), documentType: request.documentType.slice(0, 100), status: request.status, cancelReason: request.cancelReason?.slice(0, 1000) ?? null,
    customMessage: correction
      ? `There has been an administrative correction. The status of your document is: ${request.status.replace(/_/g, " ")}. Please refer to your dashboard for the latest information.`
      : templates[request.status] ?? defaults[request.status],
  });
  // The status audit ID is the durable event identity, not a retry-generated key.
  await tx.notificationOutbox.create({ data: {
    id: eventId, requestId: request.id, version: request.notificationVersion, studentId: request.studentId,
    status: request.status, correction, content,
  } });
}
