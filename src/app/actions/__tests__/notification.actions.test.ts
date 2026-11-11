import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationOutbox } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { notificationCredentialFingerprint } from "@/lib/notification-worker";
import { retryNotification, wakeNotificationWorker } from "../notification.actions";
import { scheduleNotificationDelivery } from "@/lib/notification-wakeup";

const NOW = new Date("2026-11-11T04:00:00Z");
const ID = "cm0x2a3bc000008mia76m2p2g";
let row: NotificationOutbox;
function form(changes: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({ id: ID, version: NOW.toISOString(), reason: "Sender configuration corrected", ...changes }).forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubEnv("RESEND_API_KEY", "re_synthetic");
  row = { id: ID, requestId: ID, version: 1, studentId: "user_student123", status: "PROCESSING", correction: false, content: {}, state: "REVIEW",
    payload: null, firstAttemptAt: null, credentialFingerprint: null, attempts: 5, retryLimit: 5, nextAttemptAt: NOW, leaseToken: null,
    providerEmailId: null, lastError: "sender_not_configured", sentAt: null, createdAt: NOW, updatedAt: NOW };
  vi.mocked(requireAdmin).mockResolvedValue("admin123");
  vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma));
  vi.mocked(prisma.notificationOutbox.findUnique).mockResolvedValue(row);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("Administrator notification recovery", () => {
  it.each(["Unauthorized", "Forbidden"])("rejects %s before reading or waking delivery", async message => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error(message));
    expect((await retryNotification(form())).success).toBe(false);
    expect((await wakeNotificationWorker()).success).toBe(false);
    expect(prisma.notificationOutbox.findUnique).not.toHaveBeenCalled();
    expect(scheduleNotificationDelivery).not.toHaveBeenCalled();
  });
  it.each([{ id: "bad" }, { version: "bad" }, { reason: " " }])("validates retry inputs (%j)", async change => {
    const data = form(); Object.entries(change).forEach(([key, value]) => data.set(key, value));
    expect((await retryNotification(data)).success).toBe(false);
    expect(prisma.notificationOutbox.update).not.toHaveBeenCalled();
  });
  it("keeps payload identity and attempt history when recovering a never-sent item", async () => {
    expect((await retryNotification(form({ payload: "forged", recipient: "attacker@example.invalid" }))).success).toBe(true);
    expect(prisma.notificationOutbox.update).toHaveBeenCalledWith({
      where: { id: ID, updatedAt: NOW, state: "REVIEW" },
      data: { state: "QUEUED", nextAttemptAt: NOW, retryLimit: 10, lastError: null },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ adminId: "admin123", action: "NOTIFICATION_RETRY_REQUESTED" }) }));
    expect(scheduleNotificationDelivery).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("allows uncertain results to retry only inside the original window and credential scope", async () => {
    row.firstAttemptAt = new Date(NOW.getTime() - 3600000); row.credentialFingerprint = notificationCredentialFingerprint();
    expect((await retryNotification(form())).success).toBe(true);
    expect(vi.mocked(prisma.notificationOutbox.update).mock.calls[0][0].data).not.toHaveProperty("firstAttemptAt");
    expect(vi.mocked(prisma.notificationOutbox.update).mock.calls[0][0].data).not.toHaveProperty("payload");
  });
  it.each([23, 24, 48])("cannot reset an uncertain key after %s hours", async hours => {
    row.firstAttemptAt = new Date(NOW.getTime() - hours * 3600000); row.credentialFingerprint = notificationCredentialFingerprint();
    expect((await retryNotification(form())).success).toBe(false);
    expect(prisma.notificationOutbox.update).not.toHaveBeenCalled();
    expect(scheduleNotificationDelivery).not.toHaveBeenCalled();
  });
  it("blocks uncertain retries under another sender credential", async () => {
    row.firstAttemptAt = NOW; row.credentialFingerprint = "another-credential";
    expect((await retryNotification(form())).success).toBe(false);
    expect(prisma.notificationOutbox.update).not.toHaveBeenCalled();
  });
  it.each(["SENT", "IN_FLIGHT", "SUPERSEDED"] as const)("cannot retry %s items", async state => {
    row.state = state;
    expect((await retryNotification(form())).success).toBe(false);
    expect(prisma.notificationOutbox.update).not.toHaveBeenCalled();
  });
  it("rejects stale retry forms", async () => {
    row.updatedAt = new Date(NOW.getTime() + 1);
    expect((await retryNotification(form())).success).toBe(false);
    expect(prisma.notificationOutbox.update).not.toHaveBeenCalled();
  });
});
