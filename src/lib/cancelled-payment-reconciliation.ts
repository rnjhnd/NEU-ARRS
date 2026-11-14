import { randomUUID } from "node:crypto";
import { z } from "zod";
import prisma from "./prisma";
import { expireUnpaidCheckout } from "./checkout-expiry";
import { CheckoutError, checkoutAmountSchema, checkoutSessionSchema, paymongoCheckoutSettings, verifyPaidCheckoutNamespace } from "./paymongo-checkout";
import { ownsPaymongoNamespace } from "./paymongo-namespace";
import { checkoutPaidSchema, recordCheckoutPayment } from "./paymongo-webhook";
import { providerPaidAt, recordCollection, recordFullRefund } from "./monetary-ledger";

export type ReconciliationResult = { resolved: boolean; message: string };
const refundList = z.array(z.object({
  id: z.string().max(100).regex(/^ref_[a-zA-Z0-9]+$/),
  attributes: z.object({ payment_id: z.string(), currency: z.literal("PHP"), amount: checkoutAmountSchema,
    status: z.enum(["pending", "processing", "succeeded", "failed"]) }),
})).max(1000).refine(refunds => new Set(refunds.map(refund => refund.id)).size === refunds.length);
const paymentResource = z.object({ data: z.object({ id: z.string(), attributes: z.object({
  amount: checkoutAmountSchema, currency: z.literal("PHP"), status: z.literal("paid"), livemode: z.boolean(), refunds: refundList,
  paid_at: z.number().int().nonnegative().max(253402300799).nullish(),
}) }) });

/** Provider reads and session expiry only. This workflow never submits refunds. */
export async function reconcileCancelledPayment(requestId: string, actorId: string, reason: string, expectedVersion?: Date): Promise<ReconciliationResult> {
  let order = await prisma.request.findUnique({ where: { id: requestId }, include: { checkoutAttempt: { select: { leaseUntil: true } } } });
  if (!order || order.status !== "CANCELLED" || order.paymentMethod !== "online") throw new CheckoutError("Only cancelled online requests can be reconciled.");
  if (expectedVersion && order.updatedAt.getTime() !== expectedVersion.getTime()) throw new CheckoutError("Request changed. Refresh the queue before reconciling.");
  await prisma.auditLog.create({ data: { adminId: actorId, requestId, action: "CANCELLATION_RECONCILIATION_STARTED", details: JSON.stringify({ reason, observedUpdatedAt: order.updatedAt.toISOString() }) } });
  const review = async (message: string): Promise<ReconciliationResult> => {
    await prisma.auditLog.create({ data: { adminId: actorId, requestId, action: "CANCELLATION_PAYMENT_REVIEW", details: JSON.stringify({ reason, message }) } });
    return { resolved: false, message };
  };
  if (order.paymentStatus === "REFUNDED") return { resolved: order.submissionKey !== null, message: order.submissionKey !== null
    ? "This cancelled payment is already recorded as refunded."
    : "This payment is recorded as refunded, but historical checkout references still require review." };
  if (order.paymentStatus === "UNPAID") {
    let closure: { checkoutId: string | null; livemode?: boolean } | undefined;
    if (order.paymongoCheckoutId) {
      const expiry = await expireUnpaidCheckout(order);
      if (expiry.kind === "expired") closure = expiry;
      else if (expiry.reason === "provider_payment_not_recorded") {
        const settings = paymongoCheckoutSettings();
        const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${order.paymongoCheckoutId}`, {
          headers: { Authorization: settings.authorization }, cache: "no-store", signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return review("Payment could not be verified. No refund was submitted; registrar review is required.");
        const raw: unknown = await response.json();
        const base = checkoutSessionSchema.parse(raw).data;
        if (base.id !== order.paymongoCheckoutId || base.attributes.livemode !== settings.livemode ||
            base.attributes.metadata.requestId !== order.id || base.attributes.metadata.studentId !== order.studentId ||
            !ownsPaymongoNamespace(base.attributes.metadata, settings.namespace) ||
            (order.quotedAmountCentavos !== null && base.attributes.line_items[0].amount !== order.quotedAmountCentavos)) {
          return review("Provider payment does not match this order. Registrar review is required.");
        }
        const paid = checkoutPaidSchema.parse((raw as { data: unknown }).data);
        const result = await recordCheckoutPayment(randomUUID(), settings.livemode, paid, { actorId, reason });
        if (!result.paymentRecorded && result.outcome !== "already_recorded") return review("The paid session requires manual reconciliation. No refund was submitted.");
        order = await prisma.request.findUnique({ where: { id: requestId }, include: { checkoutAttempt: { select: { leaseUntil: true } } } });
        if (!order || order.status !== "CANCELLED") return review("The request changed. Refresh before continuing.");
      } else return review("Checkout closure is unconfirmed or a payment is in progress. Do not pay or issue another refund; reconcile with PayMongo.");
    } else if (order.submissionKey !== null && order.checkoutAttempt == null && checkoutAmountSchema.safeParse(order.quotedAmountCentavos).success) {
      closure = { checkoutId: null };
    } else return review("A payment session may exist without a saved reference. Registrar reconciliation is required.");

    if (closure) {
      const snapshot = order;
      const saved = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "Request" WHERE "id" = ${requestId} FOR UPDATE`;
        const changed = await tx.request.updateMany({
          where: { id: requestId, status: "CANCELLED", paymentMethod: "online", paymentStatus: "UNPAID", paymongoPaymentId: null,
            updatedAt: snapshot.updatedAt, studentId: snapshot.studentId, paymongoCheckoutId: snapshot.paymongoCheckoutId,
            quotedAmountCentavos: snapshot.quotedAmountCentavos, submissionKey: snapshot.submissionKey,
            ...(closure.checkoutId === null ? { checkoutAttempt: { is: null } } : {}) },
          data: { updatedAt: new Date() },
        });
        await tx.auditLog.upsert({ where: { id: `cancellation-closure:${requestId}:${closure.checkoutId ?? "none"}` }, update: {},
          create: { id: `cancellation-closure:${requestId}:${closure.checkoutId ?? "none"}`, adminId: actorId, requestId,
            action: "CANCELLED_CHECKOUT_CLOSURE_VERIFIED", details: JSON.stringify({ reason, ...closure, stateMatched: changed.count === 1 }) } });
        return changed.count === 1;
      }, { maxWait: 2000, timeout: 5000 });
      if (!saved) return review("The request changed during closure. Refresh the queue and reconcile its payment.");
      if (snapshot.submissionKey === null) return review("The known session is closed, but older checkout references may exist. Historical payment review is still required.");
      return { resolved: true, message: "The cancelled request has no remaining payable checkout in the recorded workflow." };
    }
  }
  if (order.paymentStatus !== "PAID" || !/^pay_[a-zA-Z0-9]+$/.test(order.paymongoPaymentId ?? "")) return review("The stored payment reference requires registrar review.");
  const settings = paymongoCheckoutSettings();
  if (!await verifyPaidCheckoutNamespace(order, order.paymongoPaymentId!, settings)) {
    return review("The payment environment could not be verified. No financial state was changed.");
  }
  const response = await fetch(`https://api.paymongo.com/v1/payments/${order.paymongoPaymentId}`, {
    headers: { Authorization: settings.authorization }, cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return review("Refund status could not be verified. No refund was submitted.");
  const payment = paymentResource.parse(await response.json()).data;
  if (payment.id !== order.paymongoPaymentId || payment.attributes.livemode !== settings.livemode ||
      (order.quotedAmountCentavos !== null && order.quotedAmountCentavos !== payment.attributes.amount) ||
      payment.attributes.refunds.some(refund => refund.attributes.payment_id !== payment.id)) return review("The refund records do not match the original payment.");
  const refunds = payment.attributes.refunds;
  if (refunds.some(refund => ["pending", "processing"].includes(refund.attributes.status))) return review("A refund is still pending. No additional refund was submitted.");
  const succeeded = refunds.filter(refund => refund.attributes.status === "succeeded");
  if (!succeeded.length || succeeded.reduce((sum, refund) => sum + refund.attributes.amount, 0) !== payment.attributes.amount) {
    return review("A full refund has not been verified. Reconcile in PayMongo before issuing or retrying any refund.");
  }
  const snapshot = order;
  const confirmed = await prisma.$transaction(async tx => {
    const changed = await tx.request.updateMany({
      where: { id: requestId, status: "CANCELLED", paymentMethod: "online", paymentStatus: "PAID", updatedAt: snapshot.updatedAt,
        studentId: snapshot.studentId, paymongoCheckoutId: snapshot.paymongoCheckoutId, submissionKey: snapshot.submissionKey,
        paymongoPaymentId: snapshot.paymongoPaymentId, quotedAmountCentavos: snapshot.quotedAmountCentavos },
      data: { paymentStatus: "REFUNDED" },
    });
    const evidenceId = `refund-reconciled:${randomUUID()}`;
    await tx.auditLog.create({ data: { id: evidenceId, adminId: actorId, requestId, action: "CANCELLED_REFUND_RECONCILED",
      details: JSON.stringify({ reason, currency: "PHP", livemode: settings.livemode, paymentId: payment.id, amountCentavos: payment.attributes.amount,
        paidAt: providerPaidAt(payment.attributes.paid_at)?.toISOString() ?? null, refundIds: succeeded.map(refund => refund.id), confirmed: changed.count === 1 }) } });
    if (changed.count === 1) {
      await recordCollection(tx, { requestId, method: "online", collectedCentavos: payment.attributes.amount, source: "PAYMONGO_PAYMENT",
        reference: `paymongo:${settings.livemode ? "live" : "test"}:${payment.id}`, evidenceId, paidAt: providerPaidAt(payment.attributes.paid_at) });
      await recordFullRefund(tx, requestId, payment.attributes.amount, evidenceId);
    }
    return changed.count === 1;
  }, { maxWait: 2000, timeout: 5000 });
  return confirmed ? { resolved: snapshot.submissionKey !== null, message: snapshot.submissionKey !== null
    ? "PayMongo confirms a full refund. The request remains cancelled and is now recorded as refunded."
    : "The verified payment is refunded. Historical checkout references still require registrar review." }
    : review("The request changed while verifying its refund. Refresh before continuing.");
}
