import { createHash, randomUUID } from "node:crypto";
import { Prisma, type NotificationOutbox } from "@prisma/client";
import { render } from "@react-email/render";
import { z } from "zod";
import prisma from "./prisma";
import { StatusUpdateEmail } from "@/emails/status-update-email";
import { notificationContentSchema } from "./notification-content";

export const NOTIFICATION_JOB = "deliver-notifications";
export const NOTIFICATION_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const options = { maxWait: 2000, timeout: 5000 };
const payloadSchema = z.object({ from: z.string().min(1), to: z.array(z.email()).length(1), subject: z.string().max(500), html: z.string().max(500000) }).strict();
class DeliveryError extends Error {
  constructor(readonly code: string, readonly retryable = true) { super(code); }
}

export function notificationCredentialFingerprint() {
  const key = process.env.RESEND_API_KEY;
  if (!key || !/^re_\S+$/.test(key)) throw new DeliveryError("sender_not_configured", false);
  return createHash("sha256").update(key).digest("hex");
}

async function fenced<T>(token: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    const owned = await tx.cronJobState.updateMany({
      where: { name: NOTIFICATION_JOB, leaseToken: token, leaseUntil: { gt: new Date() } }, data: { updatedAt: new Date() },
    });
    if (owned.count !== 1) throw new DeliveryError("worker_lease_lost", false);
    return work(tx);
  }, options);
}

async function verifiedRecipient(studentId: string) {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key || !/^sk_(test|live)_\S+$/.test(key)) throw new DeliveryError("recipient_service_not_configured", false);
  if (!/^user_[a-zA-Z0-9]+$/.test(studentId)) throw new DeliveryError("invalid_recipient_identity", false);
  const response = await fetch(`https://api.clerk.com/v1/users/${studentId}`, {
    headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new DeliveryError("recipient_lookup_failed", response.status === 429 || response.status >= 500);
  const user = z.object({ id: z.string(), primary_email_address_id: z.string().nullable(), email_addresses: z.array(z.object({
    id: z.string(), email_address: z.email(), verification: z.object({ status: z.string() }).nullable(),
  })).max(100) }).parse(await response.json());
  if (user.id !== studentId) throw new DeliveryError("recipient_identity_mismatch", false);
  const primary = user.email_addresses.find(email => email.id === user.primary_email_address_id);
  if (!primary || primary.verification?.status !== "verified") throw new DeliveryError("primary_email_unverified", false);
  return primary.email_address;
}

async function prepare(row: NotificationOutbox, token: string): Promise<NotificationOutbox | null> {
  if (row.payload !== null) return row;
  const content = notificationContentSchema.parse(row.content);
  const current = await prisma.request.findUnique({ where: { id: row.requestId }, select: { studentId: true, status: true, notificationVersion: true } });
  if (!current || current.studentId !== row.studentId || current.status !== row.status || current.notificationVersion !== row.version) {
    await fenced(token, tx => tx.notificationOutbox.updateMany({ where: { id: row.id, leaseToken: token, state: "IN_FLIGHT" }, data: { state: "SUPERSEDED", leaseToken: null, lastError: "newer_request_state" } }));
    return null;
  }
  const from = z.email().safeParse(process.env.RESEND_FROM_EMAIL);
  const origin = z.url().safeParse(process.env.NEXT_PUBLIC_APP_URL);
  if (!from.success || !origin.success) throw new DeliveryError("sender_not_configured", false);
  const url = new URL(origin.data);
  if (url.protocol !== "https:" || url.username || url.password) throw new DeliveryError("app_url_not_configured", false);
  const fingerprint = notificationCredentialFingerprint();
  const to = await verifiedRecipient(row.studentId);
  const payload = payloadSchema.parse({
    from: `Registrar <${from.data}>`, to: [to],
    subject: `${row.correction ? "Correction: " : ""}Document Request Update: ${content.documentType.replace(/_/g, " ")}`,
    html: await render(StatusUpdateEmail({ ...content, appUrl: url.origin,
      customMessage: `${content.customMessage}\n\nStatus recorded at ${row.createdAt.toISOString()}. Check your dashboard for the latest status.\nRequest reference: ${row.requestId}` })),
  });
  return fenced(token, async tx => {
    // Recipient lookup/rendering happen outside the transaction. Recheck the
    // workflow sequence under the request lock before freezing the first POST.
    await tx.$queryRaw`SELECT "id" FROM "Request" WHERE "id" = ${row.requestId} FOR UPDATE`;
    const latest = await tx.request.findUnique({ where: { id: row.requestId }, select: { studentId: true, status: true, notificationVersion: true } });
    if (!latest || latest.studentId !== row.studentId || latest.status !== row.status || latest.notificationVersion !== row.version) {
      await tx.notificationOutbox.updateMany({ where: { id: row.id, leaseToken: token, state: "IN_FLIGHT" }, data: { state: "SUPERSEDED", leaseToken: null, lastError: "newer_request_state" } });
      return null;
    }
    return tx.notificationOutbox.update({ where: { id: row.id, leaseToken: token, state: "IN_FLIGHT", firstAttemptAt: null },
      data: { payload, firstAttemptAt: new Date(), credentialFingerprint: fingerprint } });
  });
}

async function deliver(row: NotificationOutbox, token: string) {
  if (row.attempts > row.retryLimit) throw new DeliveryError("retry_limit_reached", false);
  const prepared = await prepare(row, token);
  if (!prepared) return "superseded";
  const first = prepared.firstAttemptAt;
  if (!first || first > new Date() || Date.now() - first.getTime() >= NOTIFICATION_RETRY_WINDOW_MS) throw new DeliveryError("retry_window_expired", false);
  if (prepared.credentialFingerprint !== notificationCredentialFingerprint()) throw new DeliveryError("sender_credentials_changed", false);
  const payload = payloadSchema.parse(prepared.payload);
  // Check ownership immediately before the external POST. Frozen parameters,
  // recipient and event key are reused after uncertain results or local failures.
  await fenced(token, async () => {});
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `notification:${prepared.id}` },
    body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new DeliveryError(`provider_http_${response.status}`, response.status >= 500 || [409, 429].includes(response.status));
  // An error envelope or malformed HTTP 200 is not successful acceptance.
  const result = z.object({ id: z.uuid() }).parse(await response.json());
  await fenced(token, async tx => {
    await tx.notificationOutbox.update({ where: { id: row.id, leaseToken: token, state: "IN_FLIGHT" },
      data: { state: "SENT", providerEmailId: result.id, sentAt: new Date(), leaseToken: null, lastError: null } });
    await tx.auditLog.create({ data: { adminId: "system:notifications", action: "NOTIFICATION_ACCEPTED", requestId: row.requestId,
      details: JSON.stringify({ notificationId: row.id, providerEmailId: result.id }) } });
  });
  return "accepted";
}

export async function deliverNotificationOutbox() {
  const deadline = Date.now() + 30_000;
  try {
    await prisma.cronJobState.upsert({ where: { name: NOTIFICATION_JOB }, update: {}, create: { name: NOTIFICATION_JOB, leaseUntil: new Date(0) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { busy: true, processed: 0, accepted: 0 };
    throw error;
  }
  const token = randomUUID();
  const claimed = await prisma.cronJobState.updateMany({ where: { name: NOTIFICATION_JOB, leaseUntil: { lte: new Date() } }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + 120_000) } });
  if (claimed.count !== 1) return { busy: true, processed: 0, accepted: 0 };
  const counts = { processed: 0, accepted: 0, retrying: 0, review: 0, superseded: 0 };
  try {
    const rows = await prisma.notificationOutbox.findMany({ where: { state: { in: ["QUEUED", "IN_FLIGHT"] }, nextAttemptAt: { lte: new Date() } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 10 });
    for (const candidate of rows) {
      if (Date.now() >= deadline) break;
      const row = await fenced(token, tx => tx.notificationOutbox.update({ where: { id: candidate.id, state: { in: ["QUEUED", "IN_FLIGHT"] } },
        data: { state: "IN_FLIGHT", leaseToken: token, attempts: { increment: 1 } } }));
      counts.processed++;
      try {
        const result = await deliver(row, token);
        counts[result]++;
      } catch (error) {
        const latest = await prisma.notificationOutbox.findUnique({ where: { id: row.id } });
        if (!latest) throw error;
        const code = error instanceof DeliveryError ? error.code : "delivery_result_unconfirmed";
        const withinWindow = !latest.firstAttemptAt || (latest.firstAttemptAt <= new Date() && Date.now() - latest.firstAttemptAt.getTime() < NOTIFICATION_RETRY_WINDOW_MS);
        const retry = (!(error instanceof DeliveryError) || error.retryable) && latest.attempts < latest.retryLimit && withinWindow;
        await fenced(token, async tx => {
          await tx.notificationOutbox.update({ where: { id: row.id, leaseToken: token, state: "IN_FLIGHT" }, data: {
            state: retry ? "QUEUED" : "REVIEW", leaseToken: null, lastError: code,
            nextAttemptAt: new Date(Date.now() + Math.min(3600, 60 * 2 ** Math.min(latest.attempts, 6)) * 1000),
          } });
          if (!retry) await tx.auditLog.create({ data: { adminId: "system:notifications", action: "NOTIFICATION_REVIEW", requestId: row.requestId,
            details: JSON.stringify({ notificationId: row.id, reason: code }) } });
        });
        if (retry) counts.retrying++; else counts.review++;
      }
    }
    return { busy: false, ...counts };
  } finally {
    const released = await prisma.cronJobState.updateMany({ where: { name: NOTIFICATION_JOB, leaseToken: token }, data: { leaseToken: null, leaseUntil: new Date(0) } });
    if (released.count !== 1) throw new DeliveryError("worker_lease_lost", false);
  }
}
