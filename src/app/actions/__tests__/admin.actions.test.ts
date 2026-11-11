import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type Request, type RequestStatus } from "@prisma/client";
import { updateRequestStatus } from "../admin.actions";
import { requireAdmin, requireEmployeeOrAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { refundPayment } from "@/lib/paymongo";
import { scheduleNotificationDelivery } from "@/lib/notification-wakeup";

const { clerkClient } = vi.hoisted(() => ({ clerkClient: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient }));
vi.mock("@/lib/paymongo", () => ({ refundPayment: vi.fn() }));

function fixture(overrides: Partial<Request> = {}): Request {
  return {
    id: "cm0x2a3bc000008mia76m2p2g", studentId: "student123", studentName: "Test Student",
    submissionKey: null, quotedAmountCentavos: 15050, notificationVersion: 0, studentNumber: "22-12345-123", documentType: "TOR", purpose: "PERSONAL",
    paymentMethod: "online", paymentStatus: "PAID", status: "PENDING_PAYMENT",
    paymongoPaymentId: "pay_test123", paymongoCheckoutId: "cs_test123", paymongoPaymentType: "gcash",
    amountPaid: 151, cancelReason: null, createdAt: new Date("2026-11-11T00:00:00Z"),
    updatedAt: new Date("2026-11-11T00:00:00Z"), ...overrides,
  };
}
function form(requests: Request[] = [fixture()], newStatus: RequestStatus = "PROCESSING", extra: Record<string, string | undefined> = {}) {
  const data = new FormData();
  requests.forEach(request => data.append("requestIds", request.id));
  data.append("expectedVersions", JSON.stringify(requests.map(request => ({ id: request.id, updatedAt: request.updatedAt.toISOString() }))));
  data.append("newStatus", newStatus);
  Object.entries(extra).forEach(([key, value]) => { if (value !== undefined) data.set(key, value); });
  return data;
}
const override = { isOverride: "true", overrideReason: "Correct registrar entry" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(requireEmployeeOrAdmin).mockResolvedValue("employee123");
  vi.mocked(requireAdmin).mockResolvedValue("admin123");
  vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma));
  vi.mocked(prisma.systemSettings.findMany).mockResolvedValue([]);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: "cm0x2a3bc000008mia76m2p2a", adminId: "actor", action: "STATUS", details: "{}", requestId: null, createdAt: new Date() });
  vi.mocked(prisma.request.findMany).mockResolvedValue([fixture()]);
  vi.mocked(prisma.request.update).mockResolvedValue(fixture({ status: "PROCESSING", notificationVersion: 1 }));
  vi.mocked(prisma.request.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(refundPayment).mockResolvedValue({ status: "succeeded", refundId: "ref_test123", amountCentavos: 15050 });
});
afterEach(() => vi.restoreAllMocks());

describe("Staff authorization and overrides", () => {
  it("returns only committed status/payment versions needed for queue recovery", async () => {
    const result = await updateRequestStatus(form());
    expect(result.success).toBe(true);
    expect(result.changes).toEqual([{ id: fixture().id, status: "PROCESSING", paymentStatus: "PAID", cancelReason: null, updatedAt: fixture().updatedAt.toISOString() }]);
    expect(result.changes?.[0]).not.toHaveProperty("paymongoPaymentId");
    expect(result.changes?.[0]).not.toHaveProperty("studentName");
  });
  it.each(["Unauthorized", "Forbidden"])("rejects non-staff before any database operation (%s)", async message => {
    vi.mocked(requireEmployeeOrAdmin).mockRejectedValueOnce(new Error(message));
    expect(await updateRequestStatus(form())).toEqual({ success: false, error: message });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("requires admin authorization even if an employee forges override and role fields", async () => {
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error("Forbidden: Admin required"));
    const result = await updateRequestStatus(form(undefined, "PROCESSING", { ...override, role: "admin" }));
    expect(result.success).toBe(false);
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("permits an employee's valid paid workflow transition without an admin override", async () => {
    expect((await updateRequestStatus(form())).success).toBe(true);
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(prisma.request.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: fixture().id, updatedAt: fixture().updatedAt, status: "PENDING_PAYMENT", paymentStatus: "PAID", paymentMethod: "online", paymongoPaymentId: "pay_test123" }),
      data: { status: "PROCESSING", cancelReason: null, notificationVersion: { increment: 1 } },
    });
  });
  it("rejects an illegal transition without override", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: "COMPLETED" })]);
    const result = await updateRequestStatus(form());
    expect(result.error).toContain("Illegal state transition");
    expect(prisma.request.update).not.toHaveBeenCalled();
  });
  it("allows an administrator's reasoned reversal and audits both states", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: "COMPLETED" })]);
    expect((await updateRequestStatus(form(undefined, "PROCESSING", override))).success).toBe(true);
    const audit = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data;
    expect(audit.action).toBe("STATUS_OVERRIDE");
    expect(JSON.parse(String(audit.details))).toMatchObject({ fromStatus: "COMPLETED", toStatus: "PROCESSING", isOverride: true, overrideReason: override.overrideReason });
  });
  it.each(["", "    ", "oops"])("requires a meaningful override reason (%j)", async overrideReason => {
    expect((await updateRequestStatus(form(undefined, "PROCESSING", { isOverride: "true", overrideReason }))).success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects no-op overrides so cancellation cannot be replayed to refund twice", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: "CANCELLED" })]);
    expect((await updateRequestStatus(form(undefined, "CANCELLED", { ...override, cancelReason: "Duplicate cancellation" }))).success).toBe(false);
    expect(refundPayment).not.toHaveBeenCalled();
  });
});

describe("Payment invariants", () => {
  it.each([
    { from: "PENDING_PAYMENT", to: "PROCESSING" },
    { from: "PROCESSING", to: "READY_FOR_PICKUP" },
    { from: "READY_FOR_PICKUP", to: "COMPLETED" },
  ] as const)("blocks unpaid online fulfillment $from -> $to", async ({ from, to }) => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: from, paymentStatus: "UNPAID", paymongoPaymentId: null })]);
    expect((await updateRequestStatus(form(undefined, to))).error).toContain("payment must be verified");
    expect(prisma.request.update).not.toHaveBeenCalled();
  });
  it.each(["PROCESSING", "READY_FOR_PICKUP", "COMPLETED"] as const)("does not let an administrator override unpaid online payment into %s", async status => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ paymentStatus: "UNPAID" })]);
    expect((await updateRequestStatus(form(undefined, status, override))).success).toBe(false);
    expect(prisma.request.update).not.toHaveBeenCalled();
  });
  it.each(["PENDING_PAYMENT", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED"] as const)("blocks reopening a refunded request as %s", async status => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: "CANCELLED", paymentStatus: "REFUNDED" })]);
    expect((await updateRequestStatus(form(undefined, status, override))).error).toContain("Refunded requests");
  });
  it("blocks reopening a cancelled payment while its refund remains unconfirmed", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: "CANCELLED", paymentStatus: "PAID" })]);
    expect((await updateRequestStatus(form(undefined, "PROCESSING", override))).error).toContain("refund reconciliation");
  });
  it("blocks reopening a cancelled unpaid online order while a late payment may still arrive", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: "CANCELLED", paymentStatus: "UNPAID", paymongoPaymentId: null })]);
    expect((await updateRequestStatus(form(undefined, "PENDING_PAYMENT", override))).error).toContain("cannot be reopened");
    expect(prisma.request.update).not.toHaveBeenCalled();
  });
  it("does not move a paid online request back to awaiting payment", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: "PROCESSING" })]);
    expect((await updateRequestStatus(form(undefined, "PENDING_PAYMENT", override))).success).toBe(false);
  });
  it.each([
    { from: "PENDING_PAYMENT", to: "PROCESSING" }, { from: "PROCESSING", to: "READY_FOR_PICKUP" },
  ] as const)("allows cash-on-pickup preparation $from -> $to", async ({ from, to }) => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: from, paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP" })]);
    expect((await updateRequestStatus(form(undefined, to))).success).toBe(true);
  });
  it("requires cash collection confirmation at completion, including admin overrides", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: "READY_FOR_PICKUP", paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP" })]);
    expect((await updateRequestStatus(form(undefined, "COMPLETED", override))).error).toContain("cash payment has been collected");
    expect(prisma.request.update).not.toHaveBeenCalled();
  });
  it("audits cash collection confirmation without inventing an online payment", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: "READY_FOR_PICKUP", paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP" })]);
    expect((await updateRequestStatus(form(undefined, "COMPLETED", { confirmCashCollected: "true" }))).success).toBe(true);
    expect(JSON.parse(String(vi.mocked(prisma.auditLog.create).mock.calls[0][0].data.details))).toMatchObject({ cashCollectedConfirmed: true });
    expect(vi.mocked(prisma.request.update).mock.calls[0][0].data).not.toHaveProperty("paymentStatus");
  });
  it.each([
    { paymentMethod: "cash", paymentStatus: "UNPAID" as const },
    { paymentMethod: "unknown", paymentStatus: "PAID" as const },
  ])("blocks inconsistent payment states %j", async payment => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture(payment)]);
    expect((await updateRequestStatus(form())).success).toBe(false);
    expect(prisma.request.update).not.toHaveBeenCalled();
  });
});

describe("Batch validation and optimistic concurrency", () => {
  it("validates every request before applying any changes", async () => {
    const rows = [fixture(), fixture({ id: "cm0x2a3bc000108mia76m2p2g", paymentStatus: "UNPAID" })];
    vi.mocked(prisma.request.findMany).mockResolvedValue(rows);
    expect((await updateRequestStatus(form(rows))).success).toBe(false);
    expect(prisma.request.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
  it("rejects missing requests instead of reporting partial success", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([]);
    expect((await updateRequestStatus(form())).success).toBe(false);
  });
  it("rejects a stale client version before writing or refunding", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ updatedAt: new Date("2026-11-11T00:01:00Z") })]);
    expect((await updateRequestStatus(form())).error).toContain("Requests changed");
    expect(prisma.request.update).not.toHaveBeenCalled();
    expect(refundPayment).not.toHaveBeenCalled();
  });
  it.each(["P2025", "P2034"])("returns a conflict on %s without financial side effects", async code => {
    vi.mocked(prisma.request.update).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Conflict", { code, clientVersion: "7.8.0" }));
    expect((await updateRequestStatus(form(undefined, "CANCELLED", { cancelReason: "Changed plans" }))).error).toContain("Requests changed");
    expect(refundPayment).not.toHaveBeenCalled();
  });
  it("does not issue a refund if the cancellation audit cannot commit", async () => {
    vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(new Error("Audit unavailable"));
    expect((await updateRequestStatus(form(undefined, "CANCELLED", { cancelReason: "Changed plans" }))).success).toBe(false);
    expect(refundPayment).not.toHaveBeenCalled();
  });
  it.each([
    { expectedVersions: "not json" }, { expectedVersions: "[]" },
    { expectedVersions: JSON.stringify([{ id: "cm0x2a3bc000108mia76m2p2g", updatedAt: fixture().updatedAt.toISOString() }]) },
    { isOverride: "yes" }, { confirmCashCollected: "yes" }, { cancelReason: "x".repeat(1001) },
  ])("rejects malformed/unmatched inputs %j", async extra => {
    expect((await updateRequestStatus(form(undefined, "PROCESSING", extra))).success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([0, 51])("rejects a batch size of %i", async count => {
    const data = form(Array.from({ length: count }, () => fixture()));
    expect((await updateRequestStatus(data)).success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects duplicate IDs and missing versions", async () => {
    expect((await updateRequestStatus(form([fixture(), fixture()]))).success).toBe(false);
    const data = form(); data.delete("expectedVersions");
    expect((await updateRequestStatus(data)).success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("Transactional notification intent", () => {
  it("fails the status transaction when durable notification insertion fails", async () => {
    vi.mocked(prisma.notificationOutbox.create).mockRejectedValueOnce(new Error("Outbox unavailable"));
    expect((await updateRequestStatus(form())).success).toBe(false);
    expect(refundPayment).not.toHaveBeenCalled();
    expect(scheduleNotificationDelivery).not.toHaveBeenCalled();
  });
  it("keeps reversals silent unless a correction email was requested", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: "COMPLETED" })]);
    expect((await updateRequestStatus(form(undefined, "PROCESSING", override))).success).toBe(true);
    expect(prisma.notificationOutbox.create).not.toHaveBeenCalled();
  });
  it("queues an opted-in correction for the saved state and version", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([fixture({ status: "COMPLETED" })]);
    expect((await updateRequestStatus(form(undefined, "PROCESSING", { ...override, sendCorrectionEmail: "true" }))).success).toBe(true);
    expect(prisma.notificationOutbox.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: "cm0x2a3bc000008mia76m2p2a", correction: true, status: "PROCESSING", version: 1 }) }));
  });
  it("rejects correction emails without an authorized override", async () => {
    expect((await updateRequestStatus(form(undefined, "PROCESSING", { sendCorrectionEmail: "true" }))).success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("keeps recipient lookup and provider delivery out of status transactions", async () => {
    clerkClient.mockRejectedValueOnce(new Error("Clerk unavailable"));
    expect((await updateRequestStatus(form())).success).toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
    expect(clerkClient).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(scheduleNotificationDelivery).toHaveBeenCalledOnce();
  });
});
