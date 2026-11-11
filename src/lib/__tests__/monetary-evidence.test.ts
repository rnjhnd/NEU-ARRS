import { expect, it } from "vitest";
import { collectionFromAudit, moneyManifestSchema, refundFromAudit } from "../monetary-evidence";
import { providerPaidAt, verifiedCollection } from "../monetary-ledger";

const order = { id: "request", paymentMethod: "online", paymentStatus: "PAID", quotedAmountCentavos: 15050, paymongoPaymentId: "pay_original", paymongoCheckoutId: "cs_original" };
const details = { source: "signed_webhook", outcome: "applied", currency: "PHP", livemode: false, checkoutId: "cs_original", paymentIds: ["pay_original"], amountCentavos: 15050, providerIntentAmountCentavos: 15050 };
const audit = { id: "paymongo:test:evt_original", requestId: order.id, action: "PAYMONGO_PAYMENT_RECORDED", createdAt: "2026-11-01T00:00:00Z", details: JSON.stringify(details) };
it("uses verified integer centavos including zero, and never substitutes a legacy amount or a quote", () => {
  expect(verifiedCollection(null, "cash")).toBeNull();
  for (const amount of [0, 15050]) expect(verifiedCollection({ currency: "PHP", method: "cash", collectedCentavos: amount }, "cash")).toBe(amount);
  for (const amount of [-1, 1.5, NaN, 2147483648]) expect(verifiedCollection({ currency: "PHP", method: "cash", collectedCentavos: amount }, "cash")).toBeNull();
  expect(verifiedCollection({ currency: "USD", method: "cash", collectedCentavos: 100 }, "cash")).toBeNull();
  expect(verifiedCollection({ currency: "PHP", method: "online", collectedCentavos: 15050 }, "cash")).toBeNull();
});
it("does not invent paid-at from a missing, invalid or future provider timestamp", () => {
  for (const value of [undefined, null, -1, 1.5, NaN, Date.now()]) expect(providerPaidAt(value)).toBeNull();
  expect(providerPaidAt(1793491200)?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
});
it("requires correlated successful provider evidence and leaves an unknown payment date null", () => {
  expect(collectionFromAudit(order, audit)).toMatchObject({ collectedCentavos: 15050, reference: "paymongo:test:pay_original", paidAt: null, verifiedAt: audit.createdAt });
  expect(() => collectionFromAudit({ ...order, id: "other" }, audit)).toThrow("different request");
});
it.each([
  { source: "operator_guess" }, { outcome: "review" }, { outcome: "review", paymentRecorded: false, reason: "cancelled_payment_requires_refund_review" },
  { currency: "USD" }, { livemode: true }, { checkoutId: "cs_other" }, { paymentIds: ["pay_other"] },
  { paymentIds: ["pay_original", "pay_second"] }, { providerIntentAmountCentavos: 15000 }, { amountCentavos: 15000, providerIntentAmountCentavos: 15000 },
  { paidAt: "2026-11-02T00:00:00Z" }, { paidAt: "invalid" },
])("rejects ambiguous or mismatched collection evidence %j", change => {
  expect(() => collectionFromAudit(order, { ...audit, details: JSON.stringify({ ...details, ...change }) })).toThrow();
});
it("accepts a recorded cancelled payment under review but rejects unknown cash quotes", () => {
  expect(collectionFromAudit(order, { ...audit, action: "PAYMONGO_PAYMENT_REVIEW", details: JSON.stringify({ ...details, outcome: "review", reason: "cancelled_payment_requires_refund_review", paymentRecorded: true }) }).collectedCentavos).toBe(15050);
  const cashAudit = { ...audit, action: "UPDATE_STATUS", details: JSON.stringify({ toStatus: "COMPLETED", cashCollectedConfirmed: true }) };
  const cash = { ...order, paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP" };
  expect(collectionFromAudit({ ...cash, quotedAmountCentavos: 0 }, cashAudit).collectedCentavos).toBe(0);
  expect(() => collectionFromAudit({ ...cash, quotedAmountCentavos: null }, cashAudit)).toThrow();
  expect(() => collectionFromAudit({ ...cash, paymentStatus: "UNPAID" }, cashAudit)).toThrow();
});
it("requires confirmed full-refund evidence and rejects conflicting modes and duplicate references", () => {
  const collection = collectionFromAudit(order, audit); const refunded = { ...order, paymentStatus: "REFUNDED" };
  const proof = { confirmed: true, paymentId: "pay_original", amountCentavos: 15050, refundIds: ["ref_verified"], currency: "PHP", livemode: false };
  const refund = { ...audit, action: "CANCELLED_REFUND_RECONCILED", details: JSON.stringify(proof) };
  expect(refundFromAudit(refunded, refund, collection)).toBe(15050);
  for (const change of [{ confirmed: false }, { amountCentavos: 15000 }, { paymentId: "pay_other" }, { refundIds: ["ref_verified", "ref_verified"] }, { livemode: true }, { currency: "USD" }]) {
    expect(() => refundFromAudit(refunded, { ...refund, details: JSON.stringify({ ...proof, ...change }) }, collection)).toThrow();
  }
});
it("rejects oversized, duplicate and ambiguous reconciliation manifests", () => {
  const entry = { requestId: "request", expectedUpdatedAt: "2026-11-01T00:00:00Z", collectionAuditId: audit.id };
  expect(() => moneyManifestSchema.parse([entry, entry])).toThrow();
  expect(() => moneyManifestSchema.parse(Array.from({ length: 101 }, (_, i) => ({ ...entry, requestId: String(i) })))).toThrow();
  expect(() => moneyManifestSchema.parse([{ ...entry, amountPaid: 150 }])).toThrow();
  expect(() => moneyManifestSchema.parse([{ ...entry, cashReceipt: { reference: "OR123", amountCentavos: 15050, currency: "PHP", note: "Verified receipt" } }])).toThrow();
});
