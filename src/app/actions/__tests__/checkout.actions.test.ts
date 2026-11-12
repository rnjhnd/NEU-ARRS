import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type CheckoutAttempt, type DocumentConfig, type Request } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireStudent as requireAuth } from "@/lib/auth";
import { createRepaymentSession, createRequest } from "../request.actions";

const NOW = new Date("2026-11-11T04:00:00Z");
const ID = "cm0x2a3bc000008mia76m2p2g";
const KEY = "d45612b0-aa07-4e33-b1a7-d63093e21c8e";
const base: Request = {
  id: ID, studentId: "mock_student_id", studentName: "Synthetic Student", notificationVersion: 0, studentNumber: "22-12345-123",
  documentType: "TOR", purpose: "PERSONAL", paymentMethod: "online", paymentStatus: "UNPAID", status: "PENDING_PAYMENT",
  submissionKey: KEY, quotedAmountCentavos: 15050, amountPaid: null, cancelReason: null,
  paymongoCheckoutId: null, paymongoPaymentId: null, paymongoPaymentType: null, createdAt: NOW, updatedAt: NOW,
};
let orders: Request[];
let attempts: CheckoutAttempt[];
let config: DocumentConfig;
let version: number;
const knownError = (code: string) => new Prisma.PrismaClientKnownRequestError("Synthetic conflict", { code, clientVersion: "7.10.1" });

function form(changes: Record<string, string | undefined> = {}) {
  const data = new FormData();
  Object.entries({ submissionKey: KEY, studentName: base.studentName, studentNumber: base.studentNumber, documentType: "TOR", purpose: "PERSONAL", paymentMethod: "online", ...changes }).forEach(([key, value]) => { if (value !== undefined) data.set(key, value); });
  return data;
}
function seed(changes: Partial<Request> = {}) {
  const row = { ...base, ...changes };
  orders.push(row);
  return row;
}
function matches(row: Request, where: object) {
  return Object.entries(where).every(([key, value]) => {
    if (!(key in row)) return true;
    const stored = row[key as keyof Request];
    return stored instanceof Date && value instanceof Date ? stored.getTime() === value.getTime() : stored === value;
  });
}
function resource(changes: Partial<ReturnType<typeof attributes>> = {}) {
  return { data: { id: "cs_test123", type: "checkout_session", attributes: { ...attributes(), ...changes } } };
}
function attributes() {
  return {
    checkout_url: "https://checkout.paymongo.com/cs_test123#synthetic", livemode: false, status: "active",
    metadata: { requestId: ID, studentId: base.studentId },
    line_items: [{ amount: 15050, currency: "PHP", quantity: 1 }],
    payments: [] as { attributes: { status: string } }[],
    payment_intent: { attributes: { status: "awaiting_payment_method" } },
  };
}
function respond(changes: Partial<ReturnType<typeof attributes>> = {}) {
  return new Response(JSON.stringify(resource(changes)), { status: 200 });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_synthetic");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.invalid");
  vi.spyOn(console, "error").mockImplementation(() => {});
  orders = []; attempts = []; version = 0;
  config = { id: "config1", typeId: "TOR", label: "Transcript", description: "Synthetic", isActive: true, price: 15050, createdAt: NOW, updatedAt: NOW };
  vi.mocked(requireAuth).mockResolvedValue(base.studentId);
  vi.mocked(prisma.systemSettings.findMany).mockResolvedValue([]);
  vi.mocked(prisma.documentConfig.findUnique, { partial: true }).mockImplementation(async () => ({ ...config }));
  vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma));
  vi.mocked(prisma.request.findUnique, { partial: true }).mockImplementation(async ({ where }) => {
    const row = where.studentId_submissionKey
      ? orders.find(row => row.studentId === where.studentId_submissionKey!.studentId && row.submissionKey === where.studentId_submissionKey!.submissionKey)
      : orders.find(row => row.id === where.id);
    return row ? { ...row } : null;
  });
  vi.mocked(prisma.request.create, { partial: true }).mockImplementation(async ({ data }) => {
    if (orders.some(row => row.studentId === data.studentId && row.submissionKey === data.submissionKey)) throw knownError("P2002");
    const row = { ...base, ...data } as Request;
    orders.push(row);
    return { ...row };
  });
  vi.mocked(prisma.request.update, { partial: true }).mockImplementation(async ({ where, data }) => {
    const row = orders.find(row => row.id === where.id && matches(row, where));
    if (!row) throw knownError("P2025");
    Object.assign(row, data, { updatedAt: new Date(NOW.getTime() + ++version) });
    return { ...row };
  });
  vi.mocked(prisma.request.updateMany, { partial: true }).mockImplementation(async ({ where, data }) => {
    const rows = orders.filter(row => matches(row, where ?? {}));
    rows.forEach(row => Object.assign(row, data, { updatedAt: new Date(NOW.getTime() + ++version) }));
    return { count: rows.length };
  });
  vi.mocked(prisma.checkoutAttempt.findUnique, { partial: true }).mockImplementation(async ({ where }) => attempts.find(attempt => attempt.requestId === where.requestId) ?? null);
  vi.mocked(prisma.checkoutAttempt.create, { partial: true }).mockImplementation(async ({ data }) => {
    if (attempts.some(attempt => attempt.requestId === data.requestId)) throw knownError("P2002");
    const attempt = { requestId: data.requestId!, idempotencyKey: KEY, payload: data.payload as Prisma.JsonValue, livemode: data.livemode, credentialFingerprint: data.credentialFingerprint, createdAt: new Date(), leaseUntil: new Date(0) };
    attempts.push(attempt);
    return attempt;
  });
  vi.mocked(prisma.checkoutAttempt.updateMany, { partial: true }).mockImplementation(async ({ where, data }) => {
    const attempt = attempts.find(attempt => attempt.requestId === where?.requestId);
    const row = orders.find(row => row.id === attempt?.requestId);
    const deadline = (where?.leaseUntil as { lte: Date }).lte;
    if (!attempt || !row || attempt.leaseUntil > deadline || !matches(row, where?.request ?? {})) return { count: 0 };
    attempt.leaseUntil = (data?.leaseUntil as Date);
    return { count: 1 };
  });
  vi.mocked(fetch).mockImplementation(async () => respond());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Order creation and intent replay", () => {
  it("uses server pricing, persists the attempt before POST, and ignores submitted price or student IDs", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => {
      expect(attempts).toHaveLength(1);
      expect(orders[0].quotedAmountCentavos).toBe(15050);
      return respond();
    });
    expect(await createRequest(form({ amount: "100", studentId: "other_student" }))).toMatchObject({ success: true, requestId: ID, redirectUrl: attributes().checkout_url });
    const init = vi.mocked(fetch).mock.calls[0][1]!;
    expect(init).toMatchObject({ method: "POST", cache: "no-store", headers: { "Idempotency-Key": KEY } });
    expect(JSON.parse(String(init.body)).data.attributes).toMatchObject({
      metadata: { studentId: base.studentId, requestId: ID }, line_items: [{ amount: 15050, quantity: 1, currency: "PHP" }],
    });
  });

  it("reuses the same order and known session for a repeated form submission", async () => {
    await createRequest(form());
    expect(await createRequest(form())).toMatchObject({ success: true, requestId: ID });
    expect(orders).toHaveLength(1);
    expect(attempts).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls.map(call => call[1]?.method)).toEqual(["POST", "GET"]);
  });

  it("replays cash submissions once, including a legitimate zero-price document", async () => {
    config.price = 0;
    await createRequest(form({ paymentMethod: "cash" }));
    expect(await createRequest(form({ paymentMethod: "cash" }))).toMatchObject({ success: true, requestId: ID });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ amountPaid: null, quotedAmountCentavos: 0, paymentStatus: "CASH_ON_PICKUP" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects changed parameters for the same intent", async () => {
    seed();
    expect(await createRequest(form({ purpose: "OTHER" }))).toMatchObject({ success: false, error: expect.stringContaining("different request") });
    expect(prisma.request.create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("converges simultaneous identical submissions on one order and provider attempt", async () => {
    const results = await Promise.all([createRequest(form()), createRequest(form())]);
    expect(results.some(result => result.success)).toBe(true);
    expect(orders).toHaveLength(1);
    expect(attempts).toHaveLength(1);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([{ submissionKey: "bad" }, { studentNumber: "invalid" }, { documentType: "" }, { purpose: "HACKED" }])("rejects malformed intent fields (%j)", async change => {
    expect(await createRequest(form(change))).toMatchObject({ success: false });
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  it.each([-1, 0, 99, 150.5, 2_147_483_648])("rejects invalid online price %s without a fallback", async price => {
    config.price = price;
    expect(await createRequest(form())).toMatchObject({ success: false });
    expect(prisma.request.create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["missing", "inactive"])("rejects %s documents", async state => {
    if (state === "missing") vi.mocked(prisma.documentConfig.findUnique).mockResolvedValue(null);
    else config.isActive = false;
    expect(await createRequest(form())).toMatchObject({ success: false });
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  it("does not expose database exception messages", async () => {
    vi.mocked(prisma.request.findUnique).mockRejectedValue(new Error("postgres://secret-private-host"));
    const result = await createRequest(form());
    expect(result).toMatchObject({ success: false });
    expect(result.error).not.toContain("secret-private-host");
  });
});

describe("Checkout resumption, uncertainty, and races", () => {
  it.each([undefined, "http://insecure.invalid", "https://user:password@example.invalid"])("rejects an unconfigured or insecure application origin (%s)", async origin => {
    seed();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(attempts).toHaveLength(0);
  });

  it("requires reconciliation for a historical order with no stored provider reference", async () => {
    seed({ submissionKey: null, quotedAmountCentavos: null });
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false, error: expect.stringContaining("older request") });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not retry an unknown attempt after a same-mode credential change", async () => {
    seed();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Synthetic timeout"));
    await createRepaymentSession(ID);
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_rotated");
    vi.setSystemTime(new Date(NOW.getTime() + 31_000));
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false, error: expect.stringContaining("registrar review") });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    { paymentStatus: "PAID" }, { paymentStatus: "REFUNDED" }, { paymentStatus: "CASH_ON_PICKUP" },
    { paymentMethod: "cash" }, { status: "CANCELLED" }, { status: "PROCESSING" },
    { status: "COMPLETED" }, { status: "READY_FOR_PICKUP" }, { studentId: "other_student" }, { paymongoPaymentId: "pay_existing" },
  ] satisfies Partial<Request>[])("does not start payment for an ineligible request (%j)", async change => {
    seed(change);
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(attempts).toHaveLength(0);
  });

  it("authenticates and validates both actions before provider calls", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("unauthorized"));
    expect(await createRequest(form())).toMatchObject({ success: false });
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false });
    expect(prisma.request.findUnique).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["../unsafe", "not-a-cuid"])("rejects malformed repayment ID %s", async id => {
    expect(await createRepaymentSession(id)).toMatchObject({ success: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reopens a known active session without recalculating its price or creating a replacement", async () => {
    seed({ paymongoCheckoutId: "cs_test123" });
    config.price = 99999;
    expect(await createRepaymentSession(ID)).toMatchObject({ success: true });
    expect(vi.mocked(fetch).mock.calls[0]).toMatchObject([expect.stringContaining("/cs_test123"), { method: "GET" }]);
    expect(prisma.documentConfig.findUnique).not.toHaveBeenCalled();
    expect(prisma.checkoutAttempt.create).not.toHaveBeenCalled();
  });

  it("recovers an unknown POST response using the persisted key and byte-identical body", async () => {
    seed();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Synthetic timeout"));
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false });
    config.price = 99999; config.label = "Changed title";
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://changed.invalid");
    vi.setSystemTime(new Date(NOW.getTime() + 31_000));
    expect(await createRepaymentSession(ID)).toMatchObject({ success: true });
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls[0][1]?.body).toBe(calls[1][1]?.body);
    expect(calls[0][1]?.headers).toEqual(calls[1][1]?.headers);
    expect(attempts).toHaveLength(1);
  });

  it("recovers after PayMongo succeeds but the local reference save fails", async () => {
    seed();
    vi.mocked(prisma.request.updateMany).mockRejectedValueOnce(new Error("Synthetic database outage"));
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false });
    expect(orders[0].paymongoCheckoutId).toBeNull();
    vi.setSystemTime(new Date(NOW.getTime() + 31_000));
    expect(await createRepaymentSession(ID)).toMatchObject({ success: true });
    expect(vi.mocked(fetch).mock.calls[0][1]?.body).toEqual(vi.mocked(fetch).mock.calls[1][1]?.body);
    expect(orders[0].paymongoCheckoutId).toBe("cs_test123");
  });

  it("does not issue another POST while the first caller holds the lease", async () => {
    seed();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Synthetic timeout"));
    await createRepaymentSession(ID);
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false, error: expect.stringContaining("progress") });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([23, 24, 48])("requires review after %s hours instead of reusing an expired provider key", async hours => {
    seed();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Synthetic timeout"));
    await createRepaymentSession(ID);
    vi.setSystemTime(new Date(NOW.getTime() + hours * 60 * 60 * 1000));
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false, error: expect.stringContaining("registrar review") });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not retry an attempt in a different provider mode", async () => {
    seed();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Synthetic timeout"));
    await createRepaymentSession(ID);
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_live_synthetic");
    vi.setSystemTime(new Date(NOW.getTime() + 31_000));
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["paid", "pending", "processing"])("does not redirect to repay a session with a %s payment", async status => {
    seed({ paymongoCheckoutId: "cs_test123" });
    vi.mocked(fetch).mockResolvedValue(respond({ payments: [{ attributes: { status } }] }));
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false });
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("GET");
  });

  it("does not replace an expired session", async () => {
    seed({ paymongoCheckoutId: "cs_test123" });
    vi.mocked(fetch).mockResolvedValue(respond({ status: "expired" }));
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false, error: expect.stringContaining("expired") });
    expect(prisma.checkoutAttempt.create).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "https://evil.invalid/pay", "https://checkout.paymongo.com.evil.invalid/pay", "https://user@checkout.paymongo.com/pay", "http://checkout.paymongo.com/pay"])("rejects untrusted provider checkout URL %s", async url => {
    seed();
    vi.mocked(fetch).mockResolvedValue(respond({ checkout_url: url }));
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false });
    expect(orders[0].paymongoCheckoutId).toBeNull();
  });

  it.each([
    { livemode: true }, { metadata: { requestId: ID, studentId: "other" } },
    { metadata: { requestId: "other", studentId: base.studentId } },
    { line_items: [{ amount: 14999, currency: "PHP", quantity: 1 }] },
    { line_items: [{ amount: 15050, currency: "USD", quantity: 1 }] },
  ])("rejects mismatched provider session data (%j)", async change => {
    seed();
    vi.mocked(fetch).mockResolvedValue(respond(change));
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false });
  });

  it("preserves cancellation and saves the provider reference when cancellation wins during POST", async () => {
    seed();
    vi.mocked(fetch).mockImplementationOnce(async () => { orders[0].status = "CANCELLED"; return respond(); })
      .mockResolvedValueOnce(respond()).mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(respond({ status: "expired", payment_intent: { attributes: { status: "cancelled" } } }));
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false, error: expect.stringContaining("changed") });
    expect(orders[0]).toMatchObject({ status: "CANCELLED", paymongoCheckoutId: "cs_test123", paymentStatus: "UNPAID" });
    expect(vi.mocked(fetch).mock.calls.filter(call => String(call[0]).endsWith("/expire"))).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes("/refunds"))).toBe(false);
  });

  it("does not return a stale redirect when the webhook records payment during retrieval", async () => {
    seed({ paymongoCheckoutId: "cs_test123" });
    vi.mocked(fetch).mockImplementationOnce(async () => { orders[0].paymentStatus = "PAID"; return respond(); });
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false });
    expect(orders[0].paymentStatus).toBe("PAID");
  });

  it.each([
    ["MAINTENANCE_MODE", "true"], ["MAINTENANCE_MODE", "invalid"], ["MAINTENANCE_MODE", ""],
    ["PAYMENT_METHODS", '{"online":false,"cash":true}'], ["PAYMENT_METHODS", "bad-json"],
    ["PAYMENT_METHODS", '{"online":"true","cash":true}'],
  ])("enforces server-side settings on resume: %s=%s", async (key, value) => {
    seed();
    vi.mocked(prisma.systemSettings.findMany).mockResolvedValue([{ id: "setting1", key, value, updatedAt: NOW }]);
    expect(await createRepaymentSession(ID)).toMatchObject({ success: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
