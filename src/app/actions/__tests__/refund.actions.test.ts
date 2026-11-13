import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type Request } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireStudent as requireAuth, requireEmployeeOrAdmin } from "@/lib/auth";
import { refundPayment, type RefundResult } from "@/lib/paymongo";
import { updateRequestStatus } from "../admin.actions";
import { cancelStudentRequest } from "../request.actions";
import { studentRequestChangeSchema } from "@/lib/student-request-model";
import { moneyFixture } from "@/lib/__tests__/money-fixture";

vi.mock("@/lib/paymongo", () => ({ refundPayment: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn().mockResolvedValue({ users: { getUser: vi.fn().mockResolvedValue({ emailAddresses: [] }) } }),
}));

const paidRequest: Request = {
  id: "cm0x2a3bc000008mia76m2p2g", studentId: "mock_student_id",
  studentName: "Test Student", submissionKey: null, quotedAmountCentavos: null, notificationVersion: 0, studentNumber: "22-12345-123", documentType: "TOR", purpose: "PERSONAL",
  paymentMethod: "online", paymentStatus: "PAID", paymongoCheckoutId: "cs_test123",
  paymongoPaymentId: "pay_test123", paymongoPaymentType: "gcash", amountPaid: 151,
  status: "PENDING_PAYMENT", cancelReason: null,
  createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const outcomes: RefundResult[] = [
  { status: "succeeded", refundId: "ref_test123", amountCentavos: 15050 },
  { status: "pending", refundId: "ref_test123", amountCentavos: 15050 },
  { status: "processing", refundId: "ref_test123", amountCentavos: 15050 },
  { status: "failed", error: "Provider unavailable" },
];

async function cancelAsAdmin() {
  const formData = new FormData();
  formData.append("requestIds", paidRequest.id);
  formData.append("newStatus", "CANCELLED");
  formData.append("cancelReason", "Changed plans");
  formData.append("expectedVersions", JSON.stringify([{ id: paidRequest.id, updatedAt: paidRequest.updatedAt.toISOString() }]));
  return updateRequestStatus(formData);
}

describe.each([
  { caller: "student", cancel: () => cancelStudentRequest(paidRequest.id, "Changed plans") },
  { caller: "staff", cancel: cancelAsAdmin },
])("$caller cancellation refund handling", ({ cancel }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.requestMoney.findUnique).mockResolvedValue(moneyFixture());
    vi.mocked(requireAuth).mockResolvedValue("mock_student_id");
    vi.mocked(requireEmployeeOrAdmin).mockResolvedValue("mock_employee_id");
    vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma));
    vi.mocked(prisma.systemSettings.findMany).mockResolvedValue([]);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: "cm0x2a3bc000008mia76m2p2a", adminId: "actor", action: "STATUS", details: "{}", requestId: null, createdAt: new Date() });
    vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...paidRequest });
    vi.mocked(prisma.request.findMany).mockResolvedValue([{ ...paidRequest }]);
    vi.mocked(prisma.request.update).mockResolvedValue({ ...paidRequest, status: "CANCELLED" });
    vi.mocked(prisma.request.updateMany).mockResolvedValue({ count: 1 });
  });

  it.each(outcomes)("only marks a confirmed full refund as REFUNDED ($status)", async outcome => {
    vi.mocked(refundPayment).mockResolvedValueOnce(outcome);
    const result = await cancel();

    expect(result.success).toBe(true);
    expect(refundPayment).toHaveBeenCalledWith(paidRequest.id, "Changed plans");
    expect(prisma.request.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: paidRequest.id, status: "PENDING_PAYMENT", paymentStatus: "PAID", updatedAt: paidRequest.updatedAt }),
      data: { status: "CANCELLED", cancelReason: "Changed plans", notificationVersion: { increment: 1 } },
    });
    if (outcome.status === "succeeded") {
      expect(prisma.request.updateMany).toHaveBeenCalledWith({
        where: { id: paidRequest.id, status: "CANCELLED", paymentMethod: "online", paymentStatus: "PAID", paymongoPaymentId: paidRequest.paymongoPaymentId },
        data: { paymentStatus: "REFUNDED" },
      });
    } else expect(prisma.request.updateMany).not.toHaveBeenCalled();
    if (outcome.status === "succeeded") expect(result.warning).toBeUndefined();
    else expect(result.warning).toBeTruthy();

    const audit = vi.mocked(prisma.auditLog.create).mock.calls[1][0];
    expect(JSON.parse(String(audit.data.details))).toEqual({ reason: "Changed plans", refund: outcome, confirmed: outcome.status === "succeeded" });
  });

  it("does not skip refunds when a legacy local amount is missing", async () => {
    const request = { ...paidRequest, amountPaid: null };
    vi.mocked(prisma.request.findUnique).mockResolvedValue(request);
    vi.mocked(prisma.request.findMany).mockResolvedValue([request]);
    vi.mocked(refundPayment).mockResolvedValueOnce(outcomes[0]);
    expect((await cancel()).success).toBe(true);
    expect(refundPayment).toHaveBeenCalledOnce();
  });
  it("returns only ISO status-change fields after cancellation, without ORM/payment internals", async () => {
    vi.mocked(refundPayment).mockResolvedValueOnce(outcomes[0]);
    const result = await cancel(); expect(result.success).toBe(true);
    if (!result.success) throw new Error("Synthetic cancellation failed");
    const change = "request" in result ? result.request : result.changes[0];
    expect(studentRequestChangeSchema.safeParse(change).success).toBe(true);
    expect(Object.keys(change).sort()).toEqual(["cancelReason", "id", "paymentStatus", "status", "updatedAt"]);
    expect(typeof change.updatedAt).toBe("string");
  });

  it.each([
    { paymentStatus: "UNPAID" as const },
    { paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP" as const },
    { paymentStatus: "REFUNDED" as const },
  ])("does not send cash, unpaid, or already refunded requests to the refund provider: %j", async overrides => {
    const request = { ...paidRequest, ...overrides };
    vi.mocked(prisma.request.findUnique).mockResolvedValue(request);
    vi.mocked(prisma.request.findMany).mockResolvedValue([request]);
    const result = await cancel();
    expect(result.success).toBe(true);
    if (request.paymentMethod === "online" && request.paymentStatus === "UNPAID") expect(result.warning).toBeTruthy();
    else expect(result.warning).toBeUndefined();
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it("does not issue a refund after a concurrent cancellation/fulfillment claim wins", async () => {
    vi.mocked(prisma.request.update).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Changed", { code: "P2025", clientVersion: "7.8.0" }));
    expect((await cancel()).success).toBe(false);
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it("preserves cancellation and warns when storing an accepted refund result fails", async () => {
    vi.mocked(refundPayment).mockResolvedValueOnce(outcomes[0]);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({ id: "audit123", adminId: "actor123", action: "CANCELLED", details: "{}", requestId: paidRequest.id, createdAt: new Date() }).mockRejectedValueOnce(new Error("Result storage unavailable"));
    const result = await cancel();
    expect(result.success).toBe(true);
    expect(result.warning).toBeTruthy();
    expect(refundPayment).toHaveBeenCalledOnce();
  });

  it("records review rather than overwriting payment state changed during a refund", async () => {
    vi.mocked(refundPayment).mockResolvedValueOnce(outcomes[0]);
    vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 0 });
    const result = await cancel();
    expect(result.success).toBe(true);
    expect(result.warning).toBeTruthy();
    expect(prisma.auditLog.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "REFUND_REVIEW" }) }));
  });
});

it("does not refund another student's request", async () => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue("other_student");
  vi.mocked(prisma.request.findUnique).mockResolvedValue(paidRequest);
  expect((await cancelStudentRequest(paidRequest.id, "Cancel")).success).toBe(false);
  expect(refundPayment).not.toHaveBeenCalled();
  expect(prisma.request.update).not.toHaveBeenCalled();
});
