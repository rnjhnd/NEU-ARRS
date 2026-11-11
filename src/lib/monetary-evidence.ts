import { z } from "zod";

const cents = z.number().int().nonnegative().max(2_147_483_647);
export const moneyManifestSchema = z.array(z.object({
  requestId: z.string().min(1).max(255), expectedUpdatedAt: z.iso.datetime(),
  collectionAuditId: z.string().min(1).max(255).optional(), refundAuditId: z.string().min(1).max(255).optional(),
  cashReceipt: z.object({ reference: z.string().trim().min(5).max(150), amountCentavos: cents, currency: z.literal("PHP"),
    paidAt: z.iso.datetime().optional(), note: z.string().trim().min(5).max(1000) }).strict().optional(),
}).strict().refine(row => !(row.collectionAuditId && row.cashReceipt), "Choose one collection evidence source")).min(1).max(100)
  .refine(rows => new Set(rows.map(row => row.requestId)).size === rows.length, "Duplicate request IDs");
type Order = { id: string; paymentMethod: string; paymentStatus: string; quotedAmountCentavos: number | null; paymongoPaymentId: string | null; paymongoCheckoutId: string | null };
type Audit = { id: string; requestId: string | null; action: string; details: string; createdAt: Date | string };
export type CollectionEvidence = { method: string; collectedCentavos: number; currency: "PHP"; source: "PAYMONGO_PAYMENT" | "CASH_CONFIRMATION" | "HISTORICAL_VERIFIED"; reference: string; paidAt: string | null; verifiedAt: Date | string; evidenceId: string };
function details(audit: Audit) { try { return JSON.parse(audit.details) as Record<string, unknown>; } catch { throw new Error("Malformed evidence JSON"); } }
export function collectionFromAudit(order: Order, audit: Audit): CollectionEvidence {
  if (audit.requestId !== order.id) throw new Error("Evidence belongs to a different request");
  const data = details(audit);
  if (order.paymentMethod === "cash" && ["PAID", "CASH_ON_PICKUP"].includes(order.paymentStatus) && ["UPDATE_STATUS", "STATUS_OVERRIDE"].includes(audit.action) && data.toStatus === "COMPLETED" && data.cashCollectedConfirmed === true) {
    const amount = cents.parse(order.quotedAmountCentavos);
    return { method: "cash", collectedCentavos: amount, currency: "PHP", source: "CASH_CONFIRMATION", reference: "cash:" + order.id, paidAt: null, evidenceId: audit.id, verifiedAt: audit.createdAt };
  }
  if (order.paymentMethod !== "online" || !["PAID", "REFUNDED"].includes(order.paymentStatus)) throw new Error("Current payment state does not match online evidence");
  let amount: number, paymentId: string, mode: string;
  if (audit.action === "REFUND_SUBMISSION_CLAIMED") {
    const claim = /^refund-claim:(live|test):(pay_[a-zA-Z0-9]+)$/.exec(audit.id);
    if (!claim || data.paymentId !== claim[2] || (data.currency !== undefined && data.currency !== "PHP")) throw new Error("Invalid verified provider claim");
    amount = cents.min(100).parse(data.amountCentavos); paymentId = claim[2]; mode = claim[1];
    if (order.paymongoPaymentId !== paymentId && !/^pi_[a-zA-Z0-9]+$/.test(order.paymongoPaymentId ?? "")) throw new Error("Payment claim does not match this order");
  } else {
    const receipt = /^(paymongo|payment-reconciliation):(live|test):/.exec(audit.id);
    if (!receipt || !["PAYMONGO_PAYMENT_RECORDED", "PAYMONGO_PAYMENT_REVIEW", "CANCELLED_PAYMENT_RECONCILED"].includes(audit.action) ||
        !["signed_webhook", "provider_retrieval"].includes(String(data.source)) ||
        !(data.outcome === "applied" || data.outcome === "already_recorded" || (data.outcome === "review" && data.paymentRecorded === true && data.reason === "cancelled_payment_requires_refund_review")) ||
        data.currency !== "PHP" || data.livemode !== (receipt[2] === "live") || data.checkoutId !== order.paymongoCheckoutId ||
        !Array.isArray(data.paymentIds) || data.paymentIds.length !== 1 || data.paymentIds[0] !== order.paymongoPaymentId) throw new Error("Audit is not a correlated, recorded provider payment");
    amount = cents.min(100).parse(data.amountCentavos);
    if (data.providerIntentAmountCentavos !== amount) throw new Error("Payment and intent amounts disagree");
    paymentId = z.string().regex(/^pay_[a-zA-Z0-9]+$/).parse(data.paymentIds[0]); mode = receipt[2];
    if (order.quotedAmountCentavos !== null && order.quotedAmountCentavos !== amount) throw new Error("Payment evidence conflicts with the saved quote");
  }
  const paidAt = z.iso.datetime().nullable().safeParse(data.paidAt ?? null);
  if (!paidAt.success || (paidAt.data && Date.parse(paidAt.data) > new Date(audit.createdAt).getTime() + 300000)) throw new Error("Invalid paid-at evidence");
  return { method: "online", collectedCentavos: amount, currency: "PHP", source: "PAYMONGO_PAYMENT", reference: "paymongo:" + mode + ":" + paymentId,
    paidAt: paidAt.data, evidenceId: audit.id, verifiedAt: audit.createdAt };
}
export function refundFromAudit(order: Order, audit: Audit, collection: { method: string; reference: string; collectedCentavos: number }) {
  if (audit.requestId !== order.id || order.paymentStatus !== "REFUNDED" || collection.method !== "online") throw new Error("Refund evidence does not match the recorded state");
  const data = details(audit);
  const reference = /^paymongo:(live|test):(pay_[a-zA-Z0-9]+)$/.exec(collection.reference);
  if (!reference || data.confirmed !== true) throw new Error("Refund was not confirmed");
  let amount: number;
  if (audit.action === "CANCELLED_REFUND_RECONCILED") {
    if (data.paymentId !== reference[2] || (data.currency !== undefined && data.currency !== "PHP") || (data.livemode !== undefined && data.livemode !== (reference[1] === "live")) || !Array.isArray(data.refundIds) || !data.refundIds.length || new Set(data.refundIds).size !== data.refundIds.length || data.refundIds.some(id => typeof id !== "string" || !/^ref_[a-zA-Z0-9]+$/.test(id))) throw new Error("Refund payment/reference mismatch");
    amount = cents.min(100).parse(data.amountCentavos);
  } else if (audit.action === "REFUND_SUCCEEDED") {
    const refund = z.object({ status: z.literal("succeeded"), refundId: z.string().regex(/^ref_[a-zA-Z0-9]+$/), amountCentavos: cents.min(100) }).parse(data.refund);
    amount = refund.amountCentavos;
  } else throw new Error("Unsupported refund evidence");
  if (amount !== collection.collectedCentavos) throw new Error("Refund does not equal the canonical collection");
  return amount;
}
