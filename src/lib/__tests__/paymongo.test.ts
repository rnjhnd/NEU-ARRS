import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type Request } from "@prisma/client";
import prisma from "@/lib/prisma";
import { refundPayment } from "../paymongo";

const paidRequest: Request = {
  id: "cm0x2a3bc000008mia76m2p2g",
  studentId: "mock_student_id",
  studentName: "Test Student",
  submissionKey: null, quotedAmountCentavos: null, notificationVersion: 0, studentNumber: "22-12345-123",
  documentType: "TOR",
  purpose: "PERSONAL",
  paymentMethod: "online",
  paymentStatus: "PAID",
  paymongoCheckoutId: "cs_test123",
  paymongoPaymentId: "pay_test123",
  paymongoPaymentType: "gcash",
  amountPaid: 151, // Legacy rounded pesos for a 15050-centavo payment.
  status: "CANCELLED",
  cancelReason: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function paymentResponse(attributes: Record<string, unknown> = {}, id = "pay_test123") {
  return Response.json({
    data: { id, attributes: { amount: 15050, currency: "PHP", status: "paid", refunds: [], ...attributes } },
  });
}

function refundResponse(attributes: Record<string, unknown> = {}) {
  return Response.json({
    data: {
      id: "ref_test123",
      attributes: {
        amount: 15050,
        currency: "PHP",
        payment_id: "pay_test123",
        status: "succeeded",
        ...attributes,
      },
    },
  });
}

describe("PayMongo full refunds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_mock");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...paidRequest });
    vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma));
    vi.mocked(prisma.request.updateMany).mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refunds the provider's gross centavos, preserving fractional pesos instead of using rounded local amounts", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse()).mockResolvedValueOnce(refundResponse());

    expect(await refundPayment(paidRequest.id, "Changed plans")).toEqual({
      status: "succeeded", refundId: "ref_test123", amountCentavos: 15050,
    });
    expect(fetch).toHaveBeenNthCalledWith(1, "https://api.paymongo.com/v1/payments/pay_test123", expect.objectContaining({
      cache: "no-store", signal: expect.any(AbortSignal),
    }));
    const [url, options] = vi.mocked(fetch).mock.calls[1];
    expect(url).toBe("https://api.paymongo.com/refunds");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(String(options?.body))).toEqual({
      data: { attributes: { amount: 15050, payment_id: "pay_test123", reason: "requested_by_customer", notes: "Changed plans" } },
    });
  });

  it("persists a unique payment-level claim before submitting a refund", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse()).mockImplementationOnce(async () => {
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: "refund-claim:test:pay_test123", action: "REFUND_SUBMISSION_CLAIMED" }) }));
      return refundResponse();
    });
    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("succeeded");
  });

  it("does not send a second POST when a durable claim already exists", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse());
    vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Existing claim", { code: "P2002", clientVersion: "7.10.1" }));
    expect(await refundPayment(paidRequest.id, "Cancel")).toMatchObject({ status: "failed", error: expect.stringContaining("already attempted") });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("allows only one concurrent refund submission for a payment even across different request IDs", async () => {
    const claimed = new Set<string>();
    vi.mocked(prisma.auditLog.create, { partial: true }).mockImplementation(async ({ data }) => {
      const id = String(data.id);
      if (claimed.has(id)) throw new Prisma.PrismaClientKnownRequestError("Duplicate claim", { code: "P2002", clientVersion: "7.10.1" });
      claimed.add(id);
      return { id };
    });
    vi.mocked(fetch).mockImplementation(async url => String(url).includes("/payments/") ? paymentResponse() : refundResponse());
    const results = await Promise.all([refundPayment(paidRequest.id, "Cancelled"), refundPayment("another_legacy_request", "Cancelled")]);
    expect(results.map(result => result.status).sort()).toEqual(["failed", "succeeded"]);
    expect(vi.mocked(fetch).mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
  });

  it.each([[{ id: "ref_existing" }], undefined].map(refunds => ({ refunds })))("requires an explicit empty provider refund list before POST ($refunds)", async ({ refunds }) => {
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse({ refunds }));
    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("failed");
    expect(fetch).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("does not POST when refund eligibility changes during the provider lookup", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse());
    vi.mocked(prisma.request.updateMany).mockResolvedValue({ count: 0 });
    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("failed");
    expect(fetch).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("resolves legacy intent references before retrieving the authoritative payment", async () => {
    vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...paidRequest, paymongoPaymentId: "pi_test123" });
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ data: { id: "pi_test123", attributes: { payments: [
        { id: "pay_failed123", attributes: { status: "failed" } },
        { id: "pay_test123", attributes: { status: "paid" } },
      ] } } }))
      .mockResolvedValueOnce(paymentResponse())
      .mockResolvedValueOnce(refundResponse());

    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("succeeded");
    expect(fetch).toHaveBeenNthCalledWith(2, "https://api.paymongo.com/v1/payments/pay_test123", expect.any(Object));
  });

  it.each([[], ["pay_one", "pay_two"]])("requires manual review when an intent has an ambiguous number of paid payments (%j)", async (...ids) => {
    vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...paidRequest, paymongoPaymentId: "pi_test123" });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ data: { id: "pi_test123", attributes: {
      payments: ids.map(id => ({ id, attributes: { status: "paid" } })),
    } } }));

    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("failed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { paymentStatus: "UNPAID" as const },
    { paymentMethod: "cash" },
    { paymongoPaymentId: null },
    { paymongoPaymentId: "pay_../../other" },
  ])("does not contact PayMongo for ineligible or malformed local references: %j", async overrides => {
    vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...paidRequest, ...overrides });
    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails without contacting PayMongo when the secret is missing", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "");
    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { amount: 0 }, { amount: -15050 }, { amount: 150.5 },
    { amount: "15050" }, { amount: 2_147_483_648 },
    { currency: "USD" }, { status: "pending" }, { status: "failed" },
  ])("never submits a refund for an invalid/unpaid provider payment: %j", async attributes => {
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse(attributes));
    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("failed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a payment response for a different payment ID", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse({}, "pay_other123"));
    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("failed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["pending", "processing", "succeeded", "failed"])("preserves the provider's %s refund status instead of treating HTTP 200 as success", async status => {
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse()).mockResolvedValueOnce(refundResponse({ status }));
    expect(await refundPayment(paidRequest.id, "Cancel")).toMatchObject({ status, refundId: "ref_test123", amountCentavos: 15050 });
  });

  it.each([
    { amount: 150 }, { payment_id: "pay_other123" }, { currency: "USD" }, { status: "unknown" },
  ])("does not confirm an unreconciled refund response: %j", async attributes => {
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse()).mockResolvedValueOnce(refundResponse(attributes));
    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("failed");
  });

  it("does not submit a refund when payment retrieval fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("failed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not confirm a rejected refund", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse()).mockResolvedValueOnce(new Response(null, { status: 400 }));
    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("failed");
  });

  it("does not automatically retry a refund POST after a timeout", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse()).mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    expect(await refundPayment(paidRequest.id, "Cancel")).toMatchObject({ status: "failed", error: expect.stringContaining("before retrying") });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("retains the claim after an uncertain POST even when the next provider read shows no refunds", async () => {
    let claimed = false;
    vi.mocked(prisma.auditLog.create, { partial: true }).mockImplementation(async () => {
      if (claimed) throw new Prisma.PrismaClientKnownRequestError("Claim exists", { code: "P2002", clientVersion: "7.10.1" });
      claimed = true;
      return { id: "refund-claim:test:pay_test123" };
    });
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse()).mockRejectedValueOnce(new Error("Unknown accepted POST result")).mockResolvedValueOnce(paymentResponse());
    expect((await refundPayment(paidRequest.id, "Cancelled")).status).toBe("failed");
    expect(await refundPayment(paidRequest.id, "Cancelled")).toMatchObject({ status: "failed", error: expect.stringContaining("already attempted") });
    expect(vi.mocked(fetch).mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
  });

  it("fails safely on malformed JSON", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(paymentResponse()).mockResolvedValueOnce(new Response("not json"));
    expect((await refundPayment(paidRequest.id, "Cancel")).status).toBe("failed");
  });
});
