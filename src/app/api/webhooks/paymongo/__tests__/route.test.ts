import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type AuditLog, type Request } from "@prisma/client";
import { NextRequest } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { POST } from "../route";
import { identityReviewFixture } from "@/lib/__tests__/identity-review-fixture";

const MOCK_SECRET = "whsk_test_mock";
const NOW = new Date("2026-11-11T04:00:00Z");
const REQUEST_ID = "cm0x2a3bc000008mia76m2p2g";
const AUDIT_ID = "paymongo:test:evt_test123";
const unpaidRequest: Request = {
  id: REQUEST_ID, studentId: "user_student123", studentName: "Test Student",
  submissionKey: null, quotedAmountCentavos: 15050, notificationVersion: 0, studentNumber: "22-12345-123", documentType: "TOR", purpose: "PERSONAL",
  paymentMethod: "online", paymentStatus: "UNPAID", status: "PENDING_PAYMENT",
  paymongoCheckoutId: "cs_test123", paymongoPaymentId: null,
  paymongoPaymentType: null, amountPaid: null, cancelReason: null,
  createdAt: NOW, updatedAt: NOW,
};
const receipt: AuditLog = {
  id: AUDIT_ID, adminId: "system:paymongo", action: "PAYMONGO_PAYMENT_RECORDED",
  details: "{}", requestId: REQUEST_ID, createdAt: NOW,
};

function paidEvent(livemode = false) {
  return {
    data: {
      id: "evt_test123", type: "event",
      attributes: {
        type: "checkout_session.payment.paid", livemode,
        created_at: Math.floor(NOW.getTime() / 1000),
        data: {
          id: "cs_test123", type: "checkout_session",
          attributes: {
            livemode,
            metadata: { requestId: REQUEST_ID, studentId: "user_student123" },
            payment_intent: {
              id: "pi_test123",
              attributes: { amount: 15050, currency: "PHP", status: "succeeded", livemode },
            },
            payments: [{
              id: "pay_test123",
              attributes: {
                amount: 15050, currency: "PHP", status: "paid", livemode,
                payment_intent_id: "pi_test123", source: { type: "gcash" },
              },
            }],
          },
        },
      },
    },
  };
}

function signature(rawBody: string | Uint8Array, timestamp: number, live = false) {
  const hash = crypto.createHmac("sha256", MOCK_SECRET).update(`${timestamp}.`).update(rawBody).digest("hex");
  return `t=${timestamp},te=${live ? "" : hash},li=${live ? hash : ""}`;
}

function request(payload: unknown, options: { rawBody?: string; timestamp?: number; live?: boolean; header?: string } = {}) {
  const body = options.rawBody ?? JSON.stringify(payload);
  return new NextRequest("https://example.invalid/api/webhooks/paymongo", {
    method: "POST",
    headers: { "Paymongo-Signature": options.header ?? signature(body, options.timestamp ?? NOW.getTime() / 1000, options.live) },
    body,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", MOCK_SECRET);
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_mock");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma));
  vi.mocked(prisma.auditLog.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.auditLog.create).mockResolvedValue(receipt);
  vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...unpaidRequest, ...{ identityReview: identityReviewFixture(unpaidRequest) } });
  vi.mocked(prisma.request.updateMany).mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Authenticated namespace dispatch", () => {
  const noDatabaseCalls = () => {
    for (const method of [prisma.$transaction, prisma.$queryRaw, prisma.request.findUnique,
      prisma.request.updateMany, prisma.auditLog.findUnique, prisma.auditLog.create, prisma.requestMoney.create]) {
      expect(method).not.toHaveBeenCalled();
    }
  };
  it.each([
    { receiver: "neu-arrs", legacy: "true", sender: "neu-arrs-demo" },
    { receiver: "neu-arrs-demo", legacy: "false", sender: "neu-arrs" },
    { receiver: "neu-arrs-demo", legacy: "false", sender: undefined },
  ])("ignores a foreign event before database access ($receiver <- $sender)", async ({ receiver, legacy, sender }) => {
    vi.stubEnv("PAYMONGO_NAMESPACE", receiver); vi.stubEnv("PAYMONGO_ACCEPT_LEGACY", legacy);
    const event = paidEvent(); if (sender) Object.assign(event.data.attributes.data.attributes.metadata, { appNamespace: sender });
    const response = await POST(request(event));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, outcome: "ignored", reason: "foreign_namespace" });
    noDatabaseCalls();
  });
  it.each(["neu-arrs", "neu-arrs-demo"])("applies an owned marked event (%s)", async namespace => {
    vi.stubEnv("PAYMONGO_NAMESPACE", namespace); vi.stubEnv("PAYMONGO_ACCEPT_LEGACY", "false");
    const event = paidEvent(); Object.assign(event.data.attributes.data.attributes.metadata, { appNamespace: namespace });
    expect(await (await POST(request(event))).json()).toMatchObject({ success: true, outcome: "applied" });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
  it("ignores a signed provider sample with omitted metadata in the isolated demo", async () => {
    vi.stubEnv("PAYMONGO_NAMESPACE", "neu-arrs-demo"); vi.stubEnv("PAYMONGO_ACCEPT_LEGACY", "false");
    const event = paidEvent();
    Reflect.deleteProperty(event.data.attributes.data.attributes, "metadata");
    Reflect.deleteProperty(event.data.attributes.data.attributes, "payment_intent");
    const response = await POST(request(event));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, outcome: "ignored", reason: "foreign_namespace" });
    noDatabaseCalls();
  });
  it("still rejects an original legacy checkout without required payment metadata", async () => {
    vi.stubEnv("PAYMONGO_NAMESPACE", "neu-arrs"); vi.stubEnv("PAYMONGO_ACCEPT_LEGACY", "true");
    const event = paidEvent(); Reflect.deleteProperty(event.data.attributes.data.attributes, "metadata");
    const response = await POST(request(event));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid checkout payment payload" });
    noDatabaseCalls();
  });
  it.each([null, [], "neu-arrs-demo", 123])("rejects malformed metadata containers (%j)", async metadata => {
    vi.stubEnv("PAYMONGO_NAMESPACE", "neu-arrs-demo"); vi.stubEnv("PAYMONGO_ACCEPT_LEGACY", "false");
    const event = paidEvent(); Object.assign(event.data.attributes.data.attributes, { metadata });
    expect((await POST(request(event))).status).toBe(400); noDatabaseCalls();
  });
  it("keeps unknown IDs in an owned namespace in audited payment review", async () => {
    const event = paidEvent(); Object.assign(event.data.attributes.data.attributes.metadata, { appNamespace: "neu-arrs" });
    vi.mocked(prisma.request.findUnique).mockResolvedValue(null);
    expect(await (await POST(request(event))).json()).toMatchObject({ outcome: "review", reason: "request_not_found" });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "PAYMONGO_PAYMENT_REVIEW" }) }));
  });
  it.each([null, 123, "", "../demo", "x".repeat(65)])("rejects malformed routing metadata (%j)", async appNamespace => {
    const event = paidEvent(); Object.assign(event.data.attributes.data.attributes.metadata, { appNamespace });
    expect((await POST(request(event))).status).toBe(400); noDatabaseCalls();
  });
  it.each([undefined, "", "Not Valid"])("fails closed without valid namespace configuration (%j)", async namespace => {
    vi.stubEnv("PAYMONGO_NAMESPACE", namespace);
    expect((await POST(request(paidEvent()))).status).toBe(503); noDatabaseCalls();
  });
  it("rejects a demo configured to accept original legacy events", async () => {
    vi.stubEnv("PAYMONGO_NAMESPACE", "neu-arrs-demo");
    expect((await POST(request(paidEvent()))).status).toBe(503); noDatabaseCalls();
  });
  it("returns a configuration error when the legacy policy is omitted, preserving provider retries", async () => {
    vi.stubEnv("PAYMONGO_ACCEPT_LEGACY", undefined);
    expect((await POST(request(paidEvent()))).status).toBe(503); noDatabaseCalls();
  });
  it("does not let a foreign namespace bypass signature, timestamp or mode checks", async () => {
    const event = paidEvent(); Object.assign(event.data.attributes.data.attributes.metadata, { appNamespace: "neu-arrs-demo" });
    expect((await POST(request(event, { header: "invalid" }))).status).toBe(401);
    expect((await POST(request(event, { timestamp: NOW.getTime() / 1000 - 301 }))).status).toBe(401);
    event.data.attributes.livemode = true;
    expect((await POST(request(event))).status).toBe(400); noDatabaseCalls();
  });
  it("rejects namespace tampering using a signature made for the original bytes", async () => {
    const event = paidEvent(), header = signature(JSON.stringify(event), NOW.getTime() / 1000);
    Object.assign(event.data.attributes.data.attributes.metadata, { appNamespace: "neu-arrs-demo" });
    expect((await POST(request(event, { header }))).status).toBe(401); noDatabaseCalls();
  });
  it("logs only bounded field paths and codes for an authenticated invalid payment", async () => {
    const event = paidEvent();
    event.data.attributes.data.attributes.payments = Array.from({ length: 10 }, (_, index) => ({
      ...event.data.attributes.data.attributes.payments[0], id: "pay_invalid" + index,
      attributes: { ...event.data.attributes.data.attributes.payments[0].attributes, amount: 0 },
    }));
    expect((await POST(request(event))).status).toBe(400); noDatabaseCalls();
    expect(console.warn).toHaveBeenCalledWith("[PayMongo] Rejected signed payload", { stage: "payment",
      issues: Array.from({ length: 5 }, (_, index) => ({ path: `attributes.payments.${index}.attributes.amount`, code: "too_small" })) });
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    for (const privateValue of [MOCK_SECRET, REQUEST_ID, "user_student123", "pay_invalid"]) expect(logged).not.toContain(privateValue);
  });
});

describe("Webhook authentication and input boundaries", () => {
  it.each(["PAYMONGO_WEBHOOK_SECRET", "PAYMONGO_SECRET_KEY"])("fails closed when %s is missing", async name => {
    vi.stubEnv(name, undefined);
    expect((await POST(request(paidEvent()))).status).toBe(503);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires a recognized API key mode", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "invalid");
    expect((await POST(request(paidEvent()))).status).toBe(503);
  });

  it("rejects unsigned requests before reading data", async () => {
    const req = request(paidEvent());
    req.headers.delete("Paymongo-Signature");
    expect((await POST(req)).status).toBe(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    "t=123,te=invalid,li=",
    `t=${NOW.getTime() / 1000},te=${"z".repeat(64)},li=`,
    `t=${NOW.getTime() / 1000},te=${"a".repeat(63)},li=`,
    "t=NaN,te=,li=",
    "t=Infinity,te=,li=",
  ])("rejects malformed signatures without database operations (%s)", async header => {
    expect((await POST(request(paidEvent(), { header }))).status).toBe(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([-301, 301])("rejects a correctly signed timestamp outside the tolerance (%i seconds)", async offset => {
    expect((await POST(request(paidEvent(), { timestamp: NOW.getTime() / 1000 + offset }))).status).toBe(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([-300, 300])("accepts the timestamp tolerance boundary (%i seconds)", async offset => {
    expect((await POST(request(paidEvent(), { timestamp: NOW.getTime() / 1000 + offset }))).status).toBe(200);
  });

  it("rejects duplicated signature fields", async () => {
    const event = paidEvent();
    const header = signature(JSON.stringify(event), NOW.getTime() / 1000) + `,t=${NOW.getTime() / 1000}`;
    expect((await POST(request(event, { header }))).status).toBe(401);
  });

  it("verifies the original bytes, accepting JSON/header whitespace but rejecting body tampering", async () => {
    const event = paidEvent();
    const rawBody = JSON.stringify(event, null, 2);
    const header = signature(rawBody, NOW.getTime() / 1000).replaceAll(",", ", ");
    expect((await POST(request(event, { rawBody, header }))).status).toBe(200);
    event.data.attributes.data.attributes.payments[0].attributes.amount = 1;
    expect((await POST(request(event, { header }))).status).toBe(401);
  });

  it("accepts live signatures only in live mode", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_live_mock");
    expect((await POST(request(paidEvent(true), { live: true }))).status).toBe(200);
    expect((await POST(request(paidEvent(true)))).status).toBe(401);
  });

  it("rejects a test event even if signed in the live signature field", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_live_mock");
    expect((await POST(request(paidEvent(), { live: true }))).status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a live signature in test mode", async () => {
    expect((await POST(request(paidEvent(true), { live: true }))).status).toBe(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects signed malformed JSON and invalid UTF-8", async () => {
    expect((await POST(request(null, { rawBody: "{broken" }))).status).toBe(400);
    const bytes = new Uint8Array([0xff]);
    const req = new NextRequest("https://example.invalid/api/webhooks/paymongo", {
      method: "POST", body: bytes,
      headers: { "Paymongo-Signature": signature(bytes, NOW.getTime() / 1000) },
    });
    expect((await POST(req)).status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("bounds the actual streamed body even without Content-Length", async () => {
    const req = request(paidEvent(), { rawBody: "x".repeat(256 * 1024 + 1) });
    expect(req.headers.has("content-length")).toBe(false);
    expect((await POST(req)).status).toBe(413);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body before reading it", async () => {
    const req = request(paidEvent());
    req.headers.set("content-length", String(256 * 1024 + 1));
    expect((await POST(req)).status).toBe(413);
  });

  it("acknowledges unsupported event types without mutating data", async () => {
    const event = paidEvent();
    event.data.attributes.type = "checkout.session.payment.paid";
    expect(await (await POST(request(event))).json()).toEqual({ success: true, outcome: "ignored" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    (event: ReturnType<typeof paidEvent>) => { event.data.id = "not-an-event"; },
    (event: ReturnType<typeof paidEvent>) => { event.data.attributes.data.id = "cs_../../other"; },
    (event: ReturnType<typeof paidEvent>) => { event.data.attributes.data.attributes.metadata.requestId = "req_123"; },
    (event: ReturnType<typeof paidEvent>) => { Reflect.deleteProperty(event.data.attributes.data.attributes.metadata, "studentId"); },
    (event: ReturnType<typeof paidEvent>) => { event.data.attributes.data.attributes.payments[0].attributes.amount = 0; },
    (event: ReturnType<typeof paidEvent>) => { event.data.attributes.data.attributes.payments[0].attributes.amount = 150.5; },
    (event: ReturnType<typeof paidEvent>) => { event.data.attributes.data.attributes.payments[0].attributes.currency = "USD"; },
    (event: ReturnType<typeof paidEvent>) => { Reflect.deleteProperty(event.data.attributes.data.attributes, "payment_intent"); },
  ])("rejects invalid signed event structures before accessing the database (%#)", async mutate => {
    const event = paidEvent();
    mutate(event);
    expect((await POST(request(event))).status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("Authoritative verification of a stale intent snapshot", () => {
  function staleEvent() {
    const event = paidEvent();
    event.data.attributes.data.attributes.payment_intent.attributes.status = "processing";
    return event;
  }
  const noCollection = () => {
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.requestMoney.create).not.toHaveBeenCalled();
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  };
  it.each(["processing", "awaiting_payment_method", "awaiting_next_action"])("verifies a %s event against the exact succeeded provider checkout", async status => {
    const event = staleEvent(); event.data.attributes.data.attributes.payment_intent.attributes.status = status;
    const current = paidEvent().data.attributes.data;
    Object.assign(current.attributes.payments[0].attributes, { paid_at: NOW.getTime() / 1000 });
    vi.mocked(fetch).mockResolvedValue(Response.json({ data: current }));
    expect(await (await POST(request(event))).json()).toEqual({ success: true, outcome: "applied" });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("https://api.paymongo.com/v1/checkout_sessions/cs_test123", expect.objectContaining({
      cache: "no-store", redirect: "error", headers: { Authorization: "Basic " + Buffer.from("sk_test_mock:").toString("base64") },
    }));
    expect(prisma.requestMoney.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      collectedCentavos: 15050, paidAt: NOW, evidenceId: AUDIT_ID,
    }) }));
  });
  it.each(["processing", "succeeded"])("recovers an empty payment-list snapshot (%s) only through exact provider intent proof", async status => {
    const event = staleEvent(); event.data.attributes.data.attributes.payment_intent.attributes.status = status;
    event.data.attributes.data.attributes.payments = [];
    vi.mocked(fetch).mockResolvedValue(Response.json({ data: paidEvent().data.attributes.data }));
    expect(await (await POST(request(event))).json()).toMatchObject({ outcome: "applied" });
    expect(fetch).toHaveBeenCalledOnce(); expect(prisma.requestMoney.create).toHaveBeenCalledOnce();
  });
  it.each([
    (current: ReturnType<typeof paidEvent>["data"]["attributes"]["data"]) => { current.id = "cs_other"; },
    current => { current.attributes.livemode = true; },
    current => { Object.assign(current.attributes.metadata, { appNamespace: "foreign-app" }); },
    current => { current.attributes.metadata.requestId = "cm0x2a3bc000008mia76m2p2h"; },
    current => { current.attributes.metadata.studentId = "another_student"; },
    current => { current.attributes.payment_intent.id = "pi_other"; },
    current => { current.attributes.payment_intent.attributes.status = "processing"; },
    current => { current.attributes.payment_intent.attributes.amount = 16000; current.attributes.payments[0].attributes.amount = 16000; },
    current => { current.attributes.payment_intent.attributes.livemode = true; },
    current => { current.attributes.payments[0].id = "pay_other"; },
    current => { current.attributes.payments[0].attributes.livemode = true; },
    current => { current.attributes.payments[0].attributes.payment_intent_id = "pi_other"; },
    current => { Reflect.deleteProperty(current.attributes.payments[0].attributes, "payment_intent_id"); },
    current => { current.attributes.payments = []; },
    current => { current.attributes.payments.push({ ...current.attributes.payments[0], id: "pay_second" }); },
  ] satisfies ((current: ReturnType<typeof paidEvent>["data"]["attributes"]["data"]) => void)[])("preserves retries and records no money for conflicting provider proof (%#)", async mutate => {
    const current = paidEvent().data.attributes.data; mutate(current);
    vi.mocked(fetch).mockResolvedValue(Response.json({ data: current }));
    const response = await POST(request(staleEvent())); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Payment verification is temporarily unavailable" }); noCollection();
  });
  it.each(["timeout", "non-200", "invalid-json"])("keeps a %s provider read retryable without any financial write", async failure => {
    if (failure === "timeout") vi.mocked(fetch).mockRejectedValue(new Error("synthetic timeout"));
    else vi.mocked(fetch).mockResolvedValue(failure === "non-200" ? new Response(null, { status: 503 }) : new Response("not JSON"));
    expect((await POST(request(staleEvent()))).status).toBe(503); noCollection();
  });
  it("does not fetch or write for an unsigned or foreign stale snapshot", async () => {
    expect((await POST(request(staleEvent(), { header: "invalid" }))).status).toBe(401);
    const event = staleEvent(); Object.assign(event.data.attributes.data.attributes.metadata, { appNamespace: "foreign-app" });
    expect(await (await POST(request(event))).json()).toMatchObject({ outcome: "ignored" });
    expect(fetch).not.toHaveBeenCalled(); noCollection();
  });
  it("does not recover malformed payment fields using a provider read", async () => {
    const event = staleEvent(); event.data.attributes.data.attributes.payments[0].attributes.amount = 0;
    expect((await POST(request(event))).status).toBe(400); expect(fetch).not.toHaveBeenCalled(); noCollection();
  });
  it("keeps a verified stale-event replay idempotent under the original event ID", async () => {
    vi.mocked(fetch).mockImplementation(async () => Response.json({ data: paidEvent().data.attributes.data }));
    vi.mocked(prisma.auditLog.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce(receipt);
    expect(await (await POST(request(staleEvent()))).json()).toMatchObject({ outcome: "applied" });
    expect(await (await POST(request(staleEvent()))).json()).toMatchObject({ outcome: "duplicate" });
    expect(prisma.request.updateMany).toHaveBeenCalledOnce(); expect(prisma.requestMoney.create).toHaveBeenCalledOnce();
  });
});

describe("Payment reconciliation and replay protection", () => {
  it("records a correlated late payment without reopening or refunding a cancelled order", async () => {
    vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...unpaidRequest, status: "CANCELLED" });
    expect(await (await POST(request(paidEvent()))).json()).toEqual({ success: true, outcome: "review", reason: "cancelled_payment_requires_refund_review", paymentRecorded: true });
    expect(prisma.request.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: "CANCELLED", paymentStatus: "UNPAID", paymongoPaymentId: null, paymongoCheckoutId: "cs_test123" }),
      data: { paymentStatus: "PAID", paymongoPaymentId: "pay_test123", paymongoPaymentType: "gcash" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves a changed state when a late cancelled payment loses its write guard", async () => {
    vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...unpaidRequest, status: "CANCELLED" });
    vi.mocked(prisma.request.updateMany).mockResolvedValue({ count: 0 });
    expect(await (await POST(request(paidEvent()))).json()).toMatchObject({ outcome: "review", paymentRecorded: false, reason: "request_changed_during_processing" });
  });

  it("rejects a provider payment and intent that agree with each other but differ from the order quote", async () => {
    vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...unpaidRequest, quotedAmountCentavos: 16000 });
    expect(await (await POST(request(paidEvent()))).json()).toMatchObject({ outcome: "review", reason: "order_amount_mismatch" });
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
    expect(JSON.parse(String(vi.mocked(prisma.auditLog.create).mock.calls[0][0].data.details))).toMatchObject({
      expectedAmountCentavos: 16000, amountCentavos: 15050, providerIntentAmountCentavos: 15050,
    });
  });

  it("retains legacy reconciliation without inventing an order quote", async () => {
    vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...unpaidRequest, quotedAmountCentavos: null });
    expect(await (await POST(request(paidEvent()))).json()).toMatchObject({ outcome: "applied" });
    expect(JSON.parse(String(vi.mocked(prisma.auditLog.create).mock.calls[0][0].data.details))).toMatchObject({ expectedAmountCentavos: null });
  });

  it("atomically applies a correlated paid payment and stores a receipt with exact centavos", async () => {
    const res = await POST(request(paidEvent()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, outcome: "applied" });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 2000, timeout: 8000 });
    expect(prisma.request.updateMany).toHaveBeenCalledWith({
      where: {
        id: REQUEST_ID, studentId: "user_student123", paymentMethod: "online", paymongoCheckoutId: "cs_test123",
        paymongoPaymentId: null, status: "PENDING_PAYMENT", paymentStatus: "UNPAID", quotedAmountCentavos: 15050,
      },
      data: { paymentStatus: "PAID", status: "PROCESSING", notificationVersion: { increment: 1 }, paymongoPaymentId: "pay_test123", paymongoPaymentType: "gcash" },
    });
    const audit = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data;
    expect(audit).toMatchObject({ id: AUDIT_ID, requestId: REQUEST_ID, action: "PAYMONGO_PAYMENT_RECORDED" });
    expect(JSON.parse(String(audit.details))).toMatchObject({ amountCentavos: 15050, expectedAmountCentavos: 15050, paymentIds: ["pay_test123"] });
    expect(prisma.request.update).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts an old event creation time when the delivery signature is fresh", async () => {
    const event = paidEvent();
    event.data.attributes.created_at = 1;
    expect((await POST(request(event))).status).toBe(200);
    expect(prisma.request.updateMany).toHaveBeenCalledOnce();
  });

  it("acknowledges a repeated event without reapplying it", async () => {
    vi.mocked(prisma.auditLog.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce(receipt);
    expect((await POST(request(paidEvent()))).status).toBe(200);
    expect(await (await POST(request(paidEvent()))).json()).toEqual({ success: true, outcome: "duplicate" });
    expect(prisma.request.updateMany).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it("acknowledges a concurrent unique-key conflict only when the event receipt exists", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate receipt", { code: "P2002", clientVersion: "7.8.0" }));
    vi.mocked(prisma.auditLog.findUnique).mockResolvedValue(receipt);
    expect(await (await POST(request(paidEvent()))).json()).toEqual({ success: true, outcome: "duplicate" });
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });

  it("does not swallow unrelated unique constraint failures", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("other constraint", { code: "P2002", clientVersion: "7.8.0" }));
    expect((await POST(request(paidEvent()))).status).toBe(500);
  });

  it.each(["PROCESSING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"] as const)("preserves %s when another event describes the same recorded payment", async status => {
    vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...unpaidRequest, status, paymentStatus: "PAID", paymongoPaymentId: "pay_test123" });
    expect(await (await POST(request(paidEvent()))).json()).toEqual({ success: true, outcome: "already_recorded" });
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { changes: { status: "COMPLETED" }, reason: "request_not_awaiting_payment" },
    { changes: { paymentStatus: "REFUNDED", paymongoPaymentId: "pay_test123" }, reason: "request_not_awaiting_payment" },
    { changes: { paymentStatus: "PAID", paymongoPaymentId: "pay_other123" }, reason: "request_not_awaiting_payment" },
    { changes: { paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP" }, reason: "not_an_online_request" },
    { changes: { studentId: "other_student" }, reason: "student_mismatch" },
    { changes: { paymongoCheckoutId: "cs_other123" }, reason: "checkout_mismatch" },
    { changes: { paymongoCheckoutId: null }, reason: "checkout_mismatch" },
  ] satisfies { changes: Partial<Request>; reason: string }[])("records a review receipt instead of overwriting a conflicting request: $reason ($changes)", async ({ changes, reason }) => {
    vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...unpaidRequest, ...changes });
    expect(await (await POST(request(paidEvent()))).json()).toEqual({ success: true, outcome: "review", reason });
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "PAYMONGO_PAYMENT_REVIEW" }) }));
  });

  it("durably records an unmatched request for manual reconciliation", async () => {
    vi.mocked(prisma.request.findUnique).mockResolvedValue(null);
    expect(await (await POST(request(paidEvent()))).json()).toMatchObject({ outcome: "review", reason: "request_not_found" });
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { change: "no paid payment", reason: "missing_or_ambiguous_paid_payment" },
    { change: "two paid payments", reason: "missing_or_ambiguous_paid_payment" },
    { change: "amount", reason: "payment_amount_mismatch" },
    { change: "intent", reason: "payment_intent_mismatch" },
    { change: "mode", reason: "resource_mode_mismatch" },
  ])("records $change conflicts for review without confirming payment", async ({ change, reason }) => {
    const event = paidEvent();
    const attributes = event.data.attributes.data.attributes;
    if (change === "no paid payment") attributes.payments[0].attributes.status = "failed";
    if (change === "two paid payments") attributes.payments.push({ ...attributes.payments[0], id: "pay_other123" });
    if (change === "amount") attributes.payments[0].attributes.amount = 100;
    if (change === "intent") attributes.payments[0].attributes.payment_intent_id = "pi_other123";
    if (change === "mode") attributes.payments[0].attributes.livemode = true;
    expect(await (await POST(request(event))).json()).toEqual({ success: true, outcome: "review", reason });
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it("does not blindly update a request that changed after it was read", async () => {
    vi.mocked(prisma.request.updateMany).mockResolvedValue({ count: 0 });
    expect(await (await POST(request(paidEvent()))).json()).toEqual({ success: true, outcome: "review", reason: "request_changed_during_processing" });
    expect(prisma.request.update).not.toHaveBeenCalled();
  });

  it("returns a retryable failure if the transaction cannot persist its audit receipt", async () => {
    vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(new Error("Audit storage unavailable"));
    expect((await POST(request(paidEvent()))).status).toBe(500);
    // Prisma rolls back the mutation with the failed audit write; no success
    // response or receipt is invented, so the provider may retry the event.
    expect((await POST(request(paidEvent()))).status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("returns a retryable failure on database outages", async () => {
    vi.mocked(prisma.request.findUnique).mockRejectedValueOnce(new Error("Database unavailable"));
    expect((await POST(request(paidEvent()))).status).toBe(500);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });
});
