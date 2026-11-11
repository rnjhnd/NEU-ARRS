import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type CronJobState, type Request as DocumentRequest } from "@prisma/client";
import prisma from "@/lib/prisma";
import { GET } from "../route";

const NOW = new Date("2026-11-11T04:00:00Z");
const SECRET = "synthetic_cron_secret_for_tests_only";
const stale = {
  submissionKey: "d45612b0-aa07-4e33-b1a7-d63093e21c8e", quotedAmountCentavos: 15050,
  id: "cm0x2a3bc000008mia76m2p2g", studentId: "student123", studentName: "Test Student",
  notificationVersion: 0, studentNumber: "22-12345-123", documentType: "TOR", purpose: "PERSONAL",
  paymentMethod: "online", paymentStatus: "UNPAID", status: "PENDING_PAYMENT",
  paymongoCheckoutId: "cs_test123", paymongoPaymentId: null, paymongoPaymentType: null,
  amountPaid: null, cancelReason: null, createdAt: new Date("2026-11-01T00:00:00Z"), updatedAt: new Date("2026-11-01T00:00:00Z"),
  checkoutAttempt: null as { leaseUntil: Date } | null,
} satisfies DocumentRequest & { checkoutAttempt: { leaseUntil: Date } | null };
let state: CronJobState;
const call = (headers: HeadersInit = { authorization: "Bearer " + SECRET }, method = "GET") => GET(new Request("https://example.invalid/api/cron/cleanup-unpaid", { headers, method }));
function attributes() {
  return {
    status: "active", livemode: false, checkout_url: "https://checkout.paymongo.com/cs_test123#synthetic",
    metadata: { requestId: stale.id, studentId: stale.studentId },
    line_items: [{ amount: 15050, currency: "PHP", quantity: 1 }],
    payments: [] as { attributes: { status: string } }[],
    payment_intent: { attributes: { status: "awaiting_payment_method" } },
  };
}
function session(changes: Partial<ReturnType<typeof attributes>> = {}, id = "cs_test123") {
  return new Response(JSON.stringify({ data: { id, type: "checkout_session", attributes: { ...attributes(), ...changes } } }));
}
function succeedsExpiry() {
  vi.mocked(fetch).mockResolvedValueOnce(session()).mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(session({ status: "expired", payment_intent: { attributes: { status: "cancelled" } } }));
}
const auditActions = () => vi.mocked(prisma.auditLog.create).mock.calls.map(call => call[0].data.action);

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubEnv("CRON_SECRET", SECRET); vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_synthetic");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  state = { name: "cleanup-unpaid", leaseToken: null, leaseUntil: new Date(0), cursorId: null, cursorCreatedAt: null, updatedAt: NOW };
  vi.mocked(prisma.cronJobState.upsert).mockResolvedValue(state);
  vi.mocked(prisma.cronJobState.findUnique, { partial: true }).mockImplementation(async () => ({ ...state }));
  vi.mocked(prisma.cronJobState.updateMany, { partial: true }).mockImplementation(async ({ where, data }) => {
    if (where?.leaseToken !== undefined && where.leaseToken !== state.leaseToken) return { count: 0 };
    const condition = where?.leaseUntil as { lte?: Date; gt?: Date } | undefined;
    if ((condition?.lte && state.leaseUntil > condition.lte) || (condition?.gt && state.leaseUntil <= condition.gt)) return { count: 0 };
    Object.assign(state, data);
    return { count: 1 };
  });
  vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma));
  vi.mocked(prisma.request.findMany).mockResolvedValue([{ ...stale }]);
  vi.mocked(prisma.request.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.auditLog.upsert, { partial: true }).mockResolvedValue({ id: "synthetic_receipt" });
  vi.mocked(prisma.auditLog.create, { partial: true }).mockResolvedValue({ id: "synthetic_audit" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Scheduler authentication", () => {
  it.each([undefined, "", "   ", "secret "])("fails closed for missing or invalid configuration (%j)", async secret => {
    vi.stubEnv("CRON_SECRET", secret);
    expect((await call()).status).toBe(503);
    expect(prisma.cronJobState.upsert).not.toHaveBeenCalled();
    expect(prisma.request.findMany).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{}, { authorization: "Bearer wrong" }, { authorization: "Basic synthetic" }, { "user-agent": "vercel-cron/1.0" }, { cookie: "__session=synthetic" }] as HeadersInit[])("rejects non-service credentials (%j)", async headers => {
    const response = await call(headers);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain(SECRET);
    expect(prisma.cronJobState.upsert).not.toHaveBeenCalled();
  });
  it.each(["HEAD", "POST"])("does not run cleanup for authenticated %s requests", async method => {
    expect((await call(undefined, method)).status).toBe(405);
    expect(prisma.request.findMany).not.toHaveBeenCalled();
  });
});

describe("Provider closure before local cancellation", () => {
  it("retrieves, expires, and verifies before an audited guarded cancellation", async () => {
    succeedsExpiry();
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ cancelled: 1, scanned: 1, review: 0 });
    expect(vi.mocked(fetch).mock.calls.map(call => call[1]?.method ?? "GET")).toEqual(["GET", "POST", "GET"]);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe("https://api.paymongo.com/v1/checkout_sessions/cs_test123/expire");
    expect(vi.mocked(fetch).mock.calls.every(call => call[1]?.cache === "no-store" && call[1]?.signal instanceof AbortSignal)).toBe(true);
    expect(prisma.request.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: stale.id, updatedAt: stale.updatedAt, createdAt: { lt: new Date("2026-11-08T04:00:00Z") },
        paymentMethod: "online", status: "PENDING_PAYMENT", paymentStatus: "UNPAID", paymongoPaymentId: null, paymongoCheckoutId: stale.paymongoCheckoutId, quotedAmountCentavos: 15050 }),
      data: { status: "CANCELLED", cancelReason: "Payment window expired (auto-cancelled)", notificationVersion: { increment: 1 } },
    });
    expect(prisma.auditLog.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ action: "PAYMONGO_CHECKOUT_EXPIRY_VERIFIED" }) }));
    expect(auditActions()).toEqual(["UNPAID_REQUEST_AUTO_CANCELLED"]);
    expect(vi.mocked(prisma.auditLog.create).mock.calls[0][0].data.adminId).toBe("system:cleanup-unpaid");
    expect(state.leaseToken).toBeNull();
  });
  it("accepts an already-expired session without posting again", async () => {
    vi.mocked(fetch).mockResolvedValue(session({ status: "expired", payment_intent: { attributes: { status: "cancelled" } } }));
    expect(await (await call()).json()).toMatchObject({ cancelled: 1 });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("closes the known legacy session but requires review of potentially overwritten checkout history", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([{ ...stale, submissionKey: null, quotedAmountCentavos: null }]);
    succeedsExpiry();
    expect(await (await call()).json()).toMatchObject({ cancelled: 0, review: 1 });
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ details: expect.stringContaining("legacy_checkout_history_unverified") }) }));
  });
  it.each(["pending", "processing"])("defers a %s payment without expiring or cancelling it", async status => {
    vi.mocked(fetch).mockResolvedValue(session({ payments: [{ attributes: { status } }] }));
    expect(await (await call()).json()).toMatchObject({ cancelled: 0, deferred: 1 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });
  it("records a paid provider session for review without synthesizing a webhook", async () => {
    vi.mocked(fetch).mockResolvedValue(session({ payments: [{ attributes: { status: "paid" } }] }));
    expect(await (await call()).json()).toMatchObject({ review: 1, cancelled: 0 });
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ action: "UNPAID_CLEANUP_REVIEW", details: expect.stringContaining("provider_payment_not_recorded") }) }));
  });
  it.each(["processing", "succeeded", "unknown_state"])("does not expire intent state %s", async status => {
    vi.mocked(fetch).mockResolvedValue(session({ payment_intent: { attributes: { status } } }));
    expect(await (await call()).json()).toMatchObject({ cancelled: 0 });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([200, 400])("only accepts expiry HTTP %s after a verified expired GET", async status => {
    vi.mocked(fetch).mockResolvedValueOnce(session()).mockResolvedValueOnce(new Response(null, { status })).mockResolvedValueOnce(session({ status: "expired" }));
    expect(await (await call()).json()).toMatchObject({ cancelled: 1 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each(["active", "paid", "pending"])("does not treat an expiry 400 as closure when the next GET is %s", async after => {
    vi.mocked(fetch).mockResolvedValueOnce(session()).mockResolvedValueOnce(new Response(null, { status: 400 })).mockResolvedValueOnce(session(after === "active" ? {} : { payments: [{ attributes: { status: after } }] }));
    expect(await (await call()).json()).toMatchObject({ cancelled: 0 });
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });
  it("recovers from an expiry timeout on the next run by retrieving expired state", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(session()).mockRejectedValueOnce(new Error("Synthetic expiry timeout"));
    expect(await (await call()).json()).toMatchObject({ review: 1, cancelled: 0 });
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(session({ status: "expired" }));
    expect(await (await call()).json()).toMatchObject({ cancelled: 1 });
    expect(vi.mocked(fetch).mock.calls.map(call => call[1]?.method ?? "GET")).toEqual(["GET", "POST", "GET"]);
  });
  it.each([401, 404, 500])("leaves retrieval HTTP %s for review", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));
    expect(await (await call()).json()).toMatchObject({ review: 1, cancelled: 0 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    { livemode: true }, { metadata: { requestId: "other", studentId: stale.studentId } },
    { metadata: { requestId: stale.id, studentId: "other" } },
    { line_items: [{ amount: 100, currency: "PHP", quantity: 1 }] },
    { line_items: [{ amount: 15050, currency: "USD", quantity: 1 }] },
    { payments: [{ attributes: { status: "refunded" } }] },
  ])("does not expire a mismatched or unsafe provider resource (%j)", async change => {
    vi.mocked(fetch).mockResolvedValue(session(change));
    expect(await (await call()).json()).toMatchObject({ review: 1, cancelled: 0 });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("does not fetch an invalid stored provider path", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([{ ...stale, paymongoCheckoutId: "../../other" }]);
    expect(await (await call()).json()).toMatchObject({ review: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails safely when provider credentials are absent", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", undefined);
    expect(await (await call()).json()).toMatchObject({ review: 1, cancelled: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves a webhook or staff update that wins the database race", async () => {
    succeedsExpiry();
    vi.mocked(prisma.request.updateMany).mockResolvedValue({ count: 0 });
    expect(await (await call()).json()).toMatchObject({ cancelled: 0, conflicts: 1 });
    expect(auditActions()).toEqual([]);
    expect(prisma.auditLog.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ action: "PAYMONGO_CHECKOUT_EXPIRY_VERIFIED" }) }));
  });
});

describe("Unconfirmed sessions and bounded resumable work", () => {
  it("guards cancellation of a new order that never had a provider attempt", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([{ ...stale, paymongoCheckoutId: null }]);
    expect(await (await call()).json()).toMatchObject({ cancelled: 1 });
    expect(fetch).not.toHaveBeenCalled();
    expect(prisma.request.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ checkoutAttempt: { is: null }, paymongoCheckoutId: null }) }));
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });
  it.each([
    { submissionKey: null, checkoutAttempt: null },
    { submissionKey: stale.submissionKey, checkoutAttempt: { leaseUntil: new Date(0) } },
    { quotedAmountCentavos: null, checkoutAttempt: null },
  ])("keeps an uncertain missing session for review (%j)", async change => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([{ ...stale, ...change, paymongoCheckoutId: null }]);
    expect(await (await call()).json()).toMatchObject({ review: 1, cancelled: 0 });
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("defers an active checkout creation lease", async () => {
    const row = { ...stale, paymongoCheckoutId: null, checkoutAttempt: { leaseUntil: new Date(NOW.getTime() + 30000) } };
    vi.mocked(prisma.request.findMany).mockResolvedValue([row]);
    expect(await (await call()).json()).toMatchObject({ deferred: 1, cancelled: 0 });
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });
  it("does no work while another invocation owns the lease", async () => {
    state.leaseUntil = new Date(NOW.getTime() + 120000); state.leaseToken = "other_worker";
    expect(await (await call()).json()).toMatchObject({ busy: true, scanned: 0 });
    expect(prisma.request.findMany).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(state.leaseToken).toBe("other_worker");
  });
  it("cannot cancel or release a newer invocation's lease", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => { state.leaseToken = "new_worker"; return session({ status: "expired" }); });
    expect((await call()).status).toBe(500);
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
    expect(state.leaseToken).toBe("new_worker");
  });
  it("limits each invocation to 25 candidates and saves its last key", async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({ ...stale, id: "c" + String(index).padStart(24, "0"), paymongoCheckoutId: null, submissionKey: null }));
    vi.mocked(prisma.request.findMany).mockResolvedValue(rows);
    expect(await (await call()).json()).toMatchObject({ scanned: 25, review: 25, hasMore: true });
    expect(state.cursorId).toBe(rows[24].id);
    expect(prisma.request.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 26, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }));
    await call();
    expect(vi.mocked(prisma.request.findMany).mock.calls[1][0]?.where).toMatchObject({ OR: [{ createdAt: { gt: stale.createdAt } }, { createdAt: stale.createdAt, id: { gt: rows[24].id } }] });
  });
  it("wraps a completed cursor and reports an empty backlog", async () => {
    state.cursorId = stale.id; state.cursorCreatedAt = stale.createdAt;
    vi.mocked(prisma.request.findMany).mockResolvedValue([]);
    expect(await (await call()).json()).toMatchObject({ scanned: 0, hasMore: false });
    expect(prisma.request.findMany).toHaveBeenCalledTimes(2);
    expect(state.cursorId).toBeNull();
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });
  it("stops launching work after the budget and keeps its completed-group cursor", async () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({ ...stale, id: "c" + String(index).padStart(24, "0"), paymongoCheckoutId: null }));
    vi.mocked(prisma.request.findMany).mockResolvedValue(rows);
    vi.mocked(prisma.request.updateMany, { partial: true }).mockImplementation(async () => { vi.setSystemTime(new Date(NOW.getTime() + 31000)); return { count: 1 }; });
    expect(await (await call()).json()).toMatchObject({ scanned: 3, hasMore: true });
    expect(state.cursorId).toBe(rows[2].id);
  });
  it("reports database errors without connection details and releases the lease", async () => {
    vi.mocked(prisma.request.findMany).mockRejectedValue(new Error("postgres://secret-private-host"));
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret-private-host");
    expect(state.leaseToken).toBeNull();
  });
  it("reports audit transaction failures instead of successful cancellations", async () => {
    succeedsExpiry();
    vi.mocked(prisma.auditLog.create).mockRejectedValue(new Error("Synthetic audit failure"));
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ cancelled: 0, failed: 1 });
  });
  it("treats concurrent initial job-row creation as a busy invocation", async () => {
    vi.mocked(prisma.cronJobState.upsert).mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Synthetic conflict", { code: "P2002", clientVersion: "7.10.1" }));
    expect(await (await call()).json()).toMatchObject({ busy: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});
