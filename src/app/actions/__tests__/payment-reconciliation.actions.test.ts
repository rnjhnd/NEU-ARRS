import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { reconcileCancelledRequest } from "../payment-reconciliation.actions";
import { moneyFixture } from "@/lib/__tests__/money-fixture";

const NOW = new Date("2026-11-11T04:00:00Z");
const ID = "cm0x2a3bc000008mia76m2p2g";
let row: Request;
let attempt: { leaseUntil: Date } | null;
function form(changes: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({ requestId: ID, expectedVersion: row.updatedAt.toISOString(), reason: "Student requested payment review", ...changes }).forEach(([key, value]) => data.set(key, value));
  return data;
}
function checkout(status = "active", paid = false) {
  return Response.json({ data: { id: "cs_test123", type: "checkout_session", attributes: {
    status, livemode: false, checkout_url: "https://checkout.paymongo.com/cs_test123#synthetic",
    metadata: { requestId: ID, studentId: "student123" },
    line_items: [{ amount: 15050, currency: "PHP", quantity: 1 }],
    payment_intent: { id: "pi_test123", attributes: { status: paid ? "succeeded" : status === "expired" ? "cancelled" : "awaiting_payment_method", amount: 15050, currency: "PHP", livemode: false } },
    payments: paid ? [{ id: "pay_test123", attributes: { status: "paid", amount: 15050, currency: "PHP", livemode: false, payment_intent_id: "pi_test123", source: { type: "gcash" } } }] : [],
  } } });
}
const refund = (id = "ref_test123", amount = 15050, status = "succeeded") => ({ id, attributes: { payment_id: "pay_test123", currency: "PHP", amount, status } });
function payment(refunds: unknown[] = [refund()], changes: Record<string, unknown> = {}) {
  return Response.json({ data: { id: "pay_test123", attributes: { amount: 15050, currency: "PHP", status: "paid", livemode: false, refunds, ...changes } } });
}
const submit = () => reconcileCancelledRequest(form());

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.mocked(prisma.requestMoney.findUnique).mockResolvedValue(moneyFixture(ID)).mockResolvedValueOnce(null);
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_synthetic");
  vi.spyOn(console, "error").mockImplementation(() => {});
  row = { id: ID, studentId: "student123", studentName: "Synthetic Student", notificationVersion: 0, studentNumber: "22-12345-123", documentType: "TOR", purpose: "PERSONAL",
    paymentMethod: "online", status: "CANCELLED", paymentStatus: "UNPAID", paymongoCheckoutId: "cs_test123", paymongoPaymentId: null, paymongoPaymentType: null,
    quotedAmountCentavos: 15050, submissionKey: "d45612b0-aa07-4e33-b1a7-d63093e21c8e", amountPaid: null, cancelReason: "Cancelled", createdAt: new Date("2026-11-01"), updatedAt: new Date("2026-11-01") };
  attempt = null;
  vi.mocked(requireAdmin).mockResolvedValue("admin123");
  vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma));
  vi.mocked(prisma.request.findUnique, { partial: true }).mockImplementation(async () => ({ ...row, checkoutAttempt: attempt }));
  vi.mocked(prisma.request.updateMany, { partial: true }).mockImplementation(async ({ where, data }) => {
    if (Object.entries(where ?? {}).some(([key, value]) => {
      if (key === "checkoutAttempt") return attempt !== null;
      if (!(key in row)) return false;
      const actual = row[key as keyof Request];
      return actual instanceof Date && value instanceof Date ? actual.getTime() !== value.getTime() : actual !== value;
    })) return { count: 0 };
    Object.assign(row, data, { updatedAt: new Date() });
    return { count: 1 };
  });
  vi.mocked(prisma.auditLog.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.auditLog.create, { partial: true }).mockResolvedValue({ id: "audit_synthetic" });
  vi.mocked(prisma.auditLog.upsert, { partial: true }).mockResolvedValue({ id: "receipt_synthetic" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Admin reconciliation boundary", () => {
  it.each(["Unauthorized", "Forbidden: Admin required"])("rejects %s before data or provider operations", async message => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error(message));
    expect(await submit()).toMatchObject({ success: false });
    expect(prisma.request.findUnique).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{ requestId: "invalid" }, { expectedVersion: "bad-date" }, { reason: " " }])("validates reconciliation input (%j)", async change => {
    const data = form(); Object.entries(change).forEach(([key, value]) => data.set(key, value));
    expect(await reconcileCancelledRequest(data)).toMatchObject({ success: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a stale displayed version before any provider action", async () => {
    expect(await reconcileCancelledRequest(form({ expectedVersion: NOW.toISOString() }))).toMatchObject({ success: false, error: expect.stringContaining("changed") });
    expect(fetch).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
  it.each(["PENDING_PAYMENT", "PROCESSING", "COMPLETED"] as const)("rejects %s orders", async status => {
    row.status = status;
    expect(await submit()).toMatchObject({ success: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects cash orders", async () => {
    row.paymentMethod = "cash";
    expect(await submit()).toMatchObject({ success: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("ignores forged provider IDs, payment states, and audit actors in the submitted form", async () => {
    row.paymentStatus = "PAID"; row.paymongoPaymentId = "pay_test123";
    vi.mocked(fetch).mockResolvedValueOnce(payment([]));
    const data = form({ paymentId: "pay_forged", paymentStatus: "REFUNDED", actorId: "forged_actor" });
    expect(await reconcileCancelledRequest(data)).toMatchObject({ success: true, resolved: false });
    expect(row.paymentStatus).toBe("PAID");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://api.paymongo.com/v1/payments/pay_test123");
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ adminId: "admin123" }) }));
  });
});

describe("Cancelled checkout closure and late payments", () => {
  it("closes and audits an unpaid session while preserving cancellation", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(checkout()).mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(checkout("expired"));
    expect(await submit()).toMatchObject({ success: true, resolved: true });
    expect(row.status).toBe("CANCELLED"); expect(row.paymentStatus).toBe("UNPAID");
    expect(vi.mocked(fetch).mock.calls.map(call => call[1]?.method ?? "GET")).toEqual(["GET", "POST", "GET"]);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe("https://api.paymongo.com/v1/checkout_sessions/cs_test123/expire");
    expect(prisma.auditLog.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ action: "CANCELLED_CHECKOUT_CLOSURE_VERIFIED", adminId: "admin123" }) }));
  });
  it("can verify repeated closure without posting again", async () => {
    vi.mocked(fetch).mockImplementation(async () => checkout("expired"));
    expect(await submit()).toMatchObject({ success: true, resolved: true });
    expect(await submit()).toMatchObject({ success: true, resolved: true });
    expect(vi.mocked(fetch).mock.calls.every(call => call[1]?.method !== "POST")).toBe(true);
  });
  it("leaves a timeout uncertain and never retries the expiry POST in the same action", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(checkout()).mockRejectedValueOnce(new Error("Synthetic timeout"));
    expect(await submit()).toMatchObject({ success: true, resolved: false });
    expect(fetch).toHaveBeenCalledTimes(2); expect(row.status).toBe("CANCELLED");
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });
  it("records a late provider payment and requests refund review without submitting a refund", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(checkout("active", true)).mockResolvedValueOnce(checkout("active", true)).mockResolvedValueOnce(payment([]));
    expect(await submit()).toMatchObject({ success: true, resolved: false });
    expect(row).toMatchObject({ status: "CANCELLED", paymentStatus: "PAID", paymongoPaymentId: "pay_test123", amountPaid: null });
    expect(vi.mocked(fetch).mock.calls.every(call => call[1]?.method !== "POST")).toBe(true);
    const audits = vi.mocked(prisma.auditLog.create).mock.calls.map(call => call[0].data);
    expect(audits).toContainEqual(expect.objectContaining({ action: "CANCELLED_PAYMENT_RECONCILED", adminId: "admin123", details: expect.stringContaining("provider_retrieval") }));
  });
  it("does not claim historical checkout history is resolved after closing a known session", async () => {
    row.submissionKey = null; row.quotedAmountCentavos = null;
    vi.mocked(fetch).mockResolvedValueOnce(checkout("expired"));
    expect(await submit()).toMatchObject({ success: true, resolved: false, message: expect.stringContaining("older checkout") });
  });
  it("verifies a new request with no provider attempt under a row lock", async () => {
    row.paymongoCheckoutId = null;
    expect(await submit()).toMatchObject({ success: true, resolved: true });
    expect(fetch).not.toHaveBeenCalled(); expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(prisma.request.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "CANCELLED", checkoutAttempt: { is: null } }) }));
  });
  it("keeps an unknown checkout attempt for manual review", async () => {
    row.paymongoCheckoutId = null; attempt = { leaseUntil: NOW };
    expect(await submit()).toMatchObject({ success: true, resolved: false });
    expect(fetch).not.toHaveBeenCalled(); expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });
});

describe("Provider-confirmed refunds without financial POSTs", () => {
  beforeEach(() => { row.paymentStatus = "PAID"; row.paymongoPaymentId = "pay_test123"; });
  it("marks a verified full refund while leaving the request cancelled", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(payment());
    expect(await submit()).toMatchObject({ success: true, resolved: true });
    expect(row).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
    expect(fetch).toHaveBeenCalledOnce(); expect(vi.mocked(fetch).mock.calls[0][1]?.method).not.toBe("POST");
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "CANCELLED_REFUND_RECONCILED" }) }));
  });
  it("accepts unique successful partial refunds that exactly total the gross payment", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(payment([refund("ref_one", 5000), refund("ref_two", 10050)]));
    expect(await submit()).toMatchObject({ success: true, resolved: true });
    expect(row.paymentStatus).toBe("REFUNDED");
  });
  it.each([
    [], [refund("ref_partial", 5000)], [refund("ref_pending", 15050, "pending")],
    [refund("ref_processing", 15050, "processing")], [refund("ref_failed", 15050, "failed")],
  ].map(refunds => ({ refunds })))("does not finalize absent, partial, or unconfirmed refunds ($refunds)", async ({ refunds }) => {
    vi.mocked(fetch).mockResolvedValueOnce(payment(refunds));
    expect(await submit()).toMatchObject({ success: true, resolved: false });
    expect(row.paymentStatus).toBe("PAID"); expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    [refund("ref_duplicate", 5000), refund("ref_duplicate", 10050)],
    [{ ...refund(), attributes: { ...refund().attributes, payment_id: "pay_other123" } }],
    [{ ...refund(), attributes: { ...refund().attributes, currency: "USD" } }],
  ].map(refunds => ({ refunds })))("rejects duplicate or mismatched refund proofs ($refunds)", async ({ refunds }) => {
    vi.mocked(fetch).mockResolvedValueOnce(payment(refunds));
    const result = await submit();
    expect(result.success ? result.resolved : false).toBe(false);
    expect(row.paymentStatus).toBe("PAID"); expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });
  it.each([{ amount: 15000 }, { currency: "USD" }, { livemode: true }, { refunds: undefined }])("rejects a mismatched payment resource (%j)", async change => {
    vi.mocked(fetch).mockResolvedValueOnce(payment([refund()], change));
    await submit(); expect(row.paymentStatus).toBe("PAID"); expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });
  it("does not overwrite concurrent payment state during refund confirmation", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(payment());
    vi.mocked(prisma.request.updateMany).mockResolvedValue({ count: 0 });
    expect(await submit()).toMatchObject({ success: true, resolved: false });
  });
  it("does not contact the provider for an already confirmed refund", async () => {
    row.paymentStatus = "REFUNDED";
    expect(await submit()).toMatchObject({ success: true, resolved: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves legacy-history warnings even after a confirmed refund", async () => {
    row.submissionKey = null;
    vi.mocked(fetch).mockResolvedValueOnce(payment());
    expect(await submit()).toMatchObject({ success: true, resolved: false });
    expect(row.paymentStatus).toBe("REFUNDED");
  });
});
