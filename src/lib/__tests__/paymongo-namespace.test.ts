import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../prisma";
import { ownsPaymongoNamespace, paymongoNamespaceSettings } from "../paymongo-namespace";
import { checkoutSessionSchema, paymongoCheckoutSettings, verifyPaidCheckoutNamespace } from "../paymongo-checkout";
import { checkoutPaidSchema, recordCheckoutPayment } from "../paymongo-webhook";
import { expireUnpaidCheckout } from "../checkout-expiry";
import { refundPayment } from "../paymongo";
import { reconcileCancelledPayment } from "../cancelled-payment-reconciliation";

const ID = "cm0x2a3bc000008mia76m2p2g", CS = "cs_namespace", PAY = "pay_namespace";
const order = { id: ID, studentId: "user_synthetic", paymongoCheckoutId: CS, quotedAmountCentavos: 15050 };
function resource(metadata: Record<string, unknown> = { appNamespace: "neu-arrs-demo" }, attributes: Record<string, unknown> = {}) {
  return { data: { id: CS, type: "checkout_session", attributes: {
    status: "active", livemode: false, checkout_url: "https://checkout.paymongo.com/synthetic",
    metadata: { requestId: ID, studentId: order.studentId, ...metadata },
    line_items: [{ amount: 15050, currency: "PHP", quantity: 1 }],
    payments: [{ id: PAY, attributes: { status: "paid", amount: 15050, currency: "PHP" } }],
    payment_intent: { id: "pi_namespace", attributes: { status: "succeeded", amount: 15050, currency: "PHP" } },
    ...attributes,
  } } };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("PAYMONGO_NAMESPACE", "neu-arrs-demo"); vi.stubEnv("PAYMONGO_ACCEPT_LEGACY", "false");
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_synthetic");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(prisma.request.findUnique, { partial: true }).mockResolvedValue({ ...order, updatedAt: new Date("2026-01-01T00:00:00Z"), paymentStatus: "PAID", paymentMethod: "online", status: "CANCELLED", paymongoPaymentId: PAY });
  vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma));
  vi.mocked(prisma.request.updateMany).mockResolvedValue({ count: 1 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Explicit payment namespace configuration", () => {
  it.each([undefined, "", " ", "../demo", "Demo", "a".repeat(65)])("fails closed for invalid namespace %j", namespace => {
    vi.stubEnv("PAYMONGO_NAMESPACE", namespace);
    expect(() => paymongoNamespaceSettings()).toThrow("not configured");
  });
  it.each(["TRUE", "1", "", " false "])("rejects malformed legacy policy %j", legacy => {
    vi.stubEnv("PAYMONGO_ACCEPT_LEGACY", legacy);
    expect(() => paymongoNamespaceSettings()).toThrow("not configured");
  });
  it("requires explicit opt-in and reserves legacy acceptance for the original app", () => {
    vi.stubEnv("PAYMONGO_ACCEPT_LEGACY", undefined);
    expect(() => paymongoNamespaceSettings()).toThrow("not configured");
    vi.stubEnv("PAYMONGO_ACCEPT_LEGACY", "true");
    expect(() => paymongoNamespaceSettings()).toThrow("not configured");
    vi.stubEnv("PAYMONGO_NAMESPACE", "neu-arrs");
    expect(ownsPaymongoNamespace({}, paymongoNamespaceSettings())).toBe(true);
    expect(ownsPaymongoNamespace({ appNamespace: "neu-arrs-demo" }, paymongoNamespaceSettings())).toBe(false);
  });
  it("preserves namespace metadata when parsing provider responses", () => {
    expect(checkoutSessionSchema.parse(resource()).data.attributes.metadata.appNamespace).toBe("neu-arrs-demo");
    const paid = resource();
    expect(checkoutPaidSchema.parse(paid.data).attributes.metadata.appNamespace).toBe("neu-arrs-demo");
  });
  it("guards direct payment reconciliation before any transaction, even for a known request ID", async () => {
    const paid = checkoutPaidSchema.parse(resource({ appNamespace: "neu-arrs" }).data);
    expect(await recordCheckoutPayment("evt_foreign", false, paid)).toEqual({ outcome: "ignored", reason: "foreign_namespace" });
    expect(prisma.$transaction).not.toHaveBeenCalled(); expect(prisma.auditLog.findUnique).not.toHaveBeenCalled();
    expect(prisma.request.findUnique).not.toHaveBeenCalled(); expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("Owned provider checkout proof", () => {
  it("accepts an exactly correlated paid checkout", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(resource()));
    expect(await verifyPaidCheckoutNamespace(order, PAY, paymongoCheckoutSettings())).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([
    { appNamespace: "neu-arrs" }, { appNamespace: undefined }, { requestId: "another_order" }, { studentId: "another_student" },
  ])("rejects foreign/unmarked/mismatched metadata %j", async metadata => {
    vi.mocked(fetch).mockResolvedValue(Response.json(resource(metadata)));
    expect(await verifyPaidCheckoutNamespace(order, PAY, paymongoCheckoutSettings())).toBe(false);
  });
  it.each([
    { livemode: true }, { payments: [{ id: "pay_other", attributes: { status: "paid" } }] },
    { payments: [{ id: PAY, attributes: { status: "pending" } }] },
    { line_items: [{ amount: 10000, currency: "PHP", quantity: 1 }] },
  ])("rejects mismatched provider proof %j", async attributes => {
    vi.mocked(fetch).mockResolvedValue(Response.json(resource(undefined, attributes)));
    expect(await verifyPaidCheckoutNamespace(order, PAY, paymongoCheckoutSettings())).toBe(false);
  });
  it("keeps missing-checkout compatibility only for explicitly enabled original legacy records", async () => {
    expect(await verifyPaidCheckoutNamespace({ ...order, paymongoCheckoutId: null }, PAY, paymongoCheckoutSettings())).toBe(false);
    vi.stubEnv("PAYMONGO_NAMESPACE", "neu-arrs"); vi.stubEnv("PAYMONGO_ACCEPT_LEGACY", "true");
    expect(await verifyPaidCheckoutNamespace({ ...order, paymongoCheckoutId: null }, PAY, paymongoCheckoutSettings())).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["neu-arrs", undefined])("does not expire a foreign/unmarked checkout (%j)", async namespace => {
    vi.mocked(fetch).mockResolvedValue(Response.json(resource({ appNamespace: namespace }, { payments: [], payment_intent: { attributes: { status: "awaiting_payment_method" } } })));
    expect(await expireUnpaidCheckout(order)).toEqual({ kind: "review", reason: "provider_session_unverified" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).not.toBe("POST");
  });
});

describe("Financial actions cannot cross the provider namespace", () => {
  it.each(["neu-arrs", undefined])("does not refund a foreign/unmarked paid checkout (%j)", async namespace => {
    vi.mocked(fetch).mockResolvedValue(Response.json(resource({ appNamespace: namespace })));
    expect(await refundPayment(ID, "Synthetic cancellation")).toMatchObject({ status: "failed", error: expect.stringContaining("environment") });
    expect(fetch).toHaveBeenCalledOnce(); expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled(); expect(prisma.requestMoney.create).not.toHaveBeenCalled();
  });
  it("allows an owned full refund after verifying the checkout/payment association", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(resource()))
      .mockResolvedValueOnce(Response.json({ data: { id: PAY, attributes: { amount: 15050, currency: "PHP", status: "paid", livemode: false, refunds: [] } } }))
      .mockResolvedValueOnce(Response.json({ data: { id: "ref_namespace", attributes: { amount: 15050, currency: "PHP", payment_id: PAY, status: "succeeded" } } }));
    expect(await refundPayment(ID, "Synthetic cancellation")).toMatchObject({ status: "succeeded", amountCentavos: 15050 });
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "REFUND_SUBMISSION_CLAIMED" }) }));
  });
  it("does not reconcile foreign checkout money or mark a request refunded", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(resource({ appNamespace: "neu-arrs" })));
    expect(await reconcileCancelledPayment(ID, "synthetic_admin", "Synthetic review")).toMatchObject({ resolved: false, message: expect.stringContaining("environment") });
    expect(fetch).toHaveBeenCalledOnce(); expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.request.updateMany).not.toHaveBeenCalled(); expect(prisma.requestMoney.create).not.toHaveBeenCalled();
  });
});
