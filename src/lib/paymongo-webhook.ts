import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "./prisma";
import { providerPaidAt, recordCollection } from "./monetary-ledger";

const providerId = (prefix: string) => z.string().max(100).regex(new RegExp(`^${prefix}_[a-zA-Z0-9]+$`));
const centavos = z.number().int().min(100).max(2_147_483_647);

export const paymongoEventSchema = z.object({
  data: z.object({
    id: providerId("evt"),
    type: z.literal("event"),
    attributes: z.object({
      type: z.string().min(1).max(128),
      livemode: z.boolean(),
      data: z.unknown(),
    }),
  }),
});

export const checkoutPaidSchema = z.object({
  id: providerId("cs"),
  type: z.literal("checkout_session"),
  attributes: z.object({
    livemode: z.boolean().optional(),
    metadata: z.object({
      requestId: z.string().cuid(),
      studentId: z.string().min(1).max(255),
    }),
    payment_intent: z.object({
      id: providerId("pi"),
      attributes: z.object({
        amount: centavos,
        currency: z.literal("PHP"),
        status: z.literal("succeeded"),
        livemode: z.boolean().optional(),
      }),
    }),
    payments: z.array(z.object({
      id: providerId("pay"),
      attributes: z.object({
        amount: centavos,
        currency: z.literal("PHP"),
        status: z.string().min(1).max(64),
        livemode: z.boolean().optional(),
        payment_intent_id: providerId("pi").optional(),
        paid_at: z.number().int().nonnegative().max(253402300799).nullish(),
        source: z.object({ type: z.string().min(1).max(64) }).nullish(),
      }),
    })).max(100),
  }),
});

type CheckoutPaid = z.infer<typeof checkoutPaidSchema>;
type Outcome = { outcome: "applied" | "already_recorded" | "duplicate" | "review"; reason?: string; paymentRecorded?: boolean };

/**
 * The unique audit ID is the durable event receipt. Its insertion and any
 * request update commit together, so a failed transaction remains retryable.
 */
export async function recordCheckoutPayment(eventId: string, livemode: boolean, checkout: CheckoutPaid, reconciliation?: { actorId: string; reason: string }): Promise<Outcome> {
  const auditId = `${reconciliation ? "payment-reconciliation" : "paymongo"}:${livemode ? "live" : "test"}:${eventId}`;
  const { metadata, payment_intent: intent } = checkout.attributes;
  const paidPayments = checkout.attributes.payments.filter(payment => payment.attributes.status === "paid");
  const payment = paidPayments.length === 1 ? paidPayments[0] : undefined;

  try {
    return await prisma.$transaction(async tx => {
      if (await tx.auditLog.findUnique({ where: { id: auditId }, select: { id: true } })) {
        return { outcome: "duplicate" };
      }

      const request = await tx.request.findUnique({
        where: { id: metadata.requestId },
        select: {
          id: true, studentId: true, paymentMethod: true, status: true,
          paymentStatus: true, paymongoCheckoutId: true, paymongoPaymentId: true,
          quotedAmountCentavos: true,
        },
      });

      let reason: string | undefined;
      if (!payment) reason = "missing_or_ambiguous_paid_payment";
      else if (payment.attributes.amount !== intent.attributes.amount) reason = "payment_amount_mismatch";
      else if (payment.attributes.payment_intent_id && payment.attributes.payment_intent_id !== intent.id) reason = "payment_intent_mismatch";
      else if ([checkout.attributes.livemode, intent.attributes.livemode, payment.attributes.livemode].some(mode => mode !== undefined && mode !== livemode)) reason = "resource_mode_mismatch";
      else if (!request) reason = "request_not_found";
      else if (request.studentId !== metadata.studentId) reason = "student_mismatch";
      else if (request.paymentMethod !== "online") reason = "not_an_online_request";
      else if (request.paymongoCheckoutId !== checkout.id) reason = "checkout_mismatch";
      else if (request.quotedAmountCentavos !== null && payment.attributes.amount !== request.quotedAmountCentavos) reason = "order_amount_mismatch";

      let result: Outcome;
      if (reason || !request || !payment) {
        result = { outcome: "review", reason };
      } else if (request.paymentStatus === "PAID" && request.paymongoPaymentId === payment.id) {
        // A new event ID can describe an already recorded payment. Preserve
        // all workflow states, including COMPLETED and CANCELLED.
        result = { outcome: "already_recorded" };
      } else if (request.status === "CANCELLED" && request.paymentStatus === "UNPAID" && request.paymongoPaymentId === null) {
        const saved = await tx.request.updateMany({
          where: { id: request.id, studentId: metadata.studentId, paymentMethod: "online", status: "CANCELLED", paymentStatus: "UNPAID",
            paymongoPaymentId: null, paymongoCheckoutId: checkout.id, quotedAmountCentavos: request.quotedAmountCentavos },
          data: { paymentStatus: "PAID", paymongoPaymentId: payment.id, paymongoPaymentType: payment.attributes.source?.type ?? "online" },
        });
        result = { outcome: "review", reason: saved.count === 1 ? "cancelled_payment_requires_refund_review" : "request_changed_during_processing", paymentRecorded: saved.count === 1 };
      } else if (reconciliation) {
        result = { outcome: "review", reason: "request_not_cancelled_or_conflicting_payment" };
      } else if (request.status !== "PENDING_PAYMENT" || request.paymentStatus !== "UNPAID" || request.paymongoPaymentId !== null) {
        result = { outcome: "review", reason: "request_not_awaiting_payment" };
      } else {
        const updated = await tx.request.updateMany({
          where: {
            id: request.id,
            studentId: metadata.studentId,
            paymentMethod: "online",
            paymongoCheckoutId: checkout.id,
            paymongoPaymentId: null,
            status: "PENDING_PAYMENT",
            paymentStatus: "UNPAID",
            quotedAmountCentavos: request.quotedAmountCentavos,
          },
          data: {
            paymentStatus: "PAID",
            status: "PROCESSING",
            notificationVersion: { increment: 1 },
            paymongoPaymentId: payment.id,
            paymongoPaymentType: payment.attributes.source?.type ?? "online",
          },
        });
        result = updated.count === 1
          ? { outcome: "applied" }
          : { outcome: "review", reason: "request_changed_during_processing" };
      }

      await tx.auditLog.create({
        data: {
          id: auditId,
          adminId: reconciliation?.actorId ?? "system:paymongo",
          action: reconciliation ? "CANCELLED_PAYMENT_RECONCILED" : result.outcome === "review" ? "PAYMONGO_PAYMENT_REVIEW" : "PAYMONGO_PAYMENT_RECORDED",
          requestId: metadata.requestId,
          details: JSON.stringify({
            ...(reconciliation ? { source: "provider_retrieval", operatorReason: reconciliation.reason } : { eventId, source: "signed_webhook" }), livemode, checkoutId: checkout.id, paymentIntentId: intent.id,
            paymentIds: paidPayments.map(paid => paid.id),
            amountCentavos: payment?.attributes.amount,
            expectedAmountCentavos: request?.quotedAmountCentavos ?? null,
            providerIntentAmountCentavos: intent.attributes.amount,
            currency: "PHP", ...result,
            paidAt: providerPaidAt(payment?.attributes.paid_at)?.toISOString() ?? null,
          }),
        },
      });
      if (payment && (result.outcome === "applied" || result.outcome === "already_recorded" || result.paymentRecorded)) {
        await recordCollection(tx, { requestId: metadata.requestId, method: "online", collectedCentavos: payment.attributes.amount,
          source: "PAYMONGO_PAYMENT", reference: `paymongo:${livemode ? "live" : "test"}:${payment.id}`, evidenceId: auditId, paidAt: providerPaidAt(payment.attributes.paid_at) });
      }
      return result;
    }, { maxWait: 2_000, timeout: 8_000 });
  } catch (error) {
    // Concurrent deliveries may both pass the initial receipt lookup. The
    // unique audit ID makes the losing transaction roll back, including its
    // request mutation. Only an existing receipt establishes a duplicate.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.auditLog.findUnique({ where: { id: auditId }, select: { id: true } });
      if (existing) return { outcome: "duplicate" };
    }
    throw error;
  }
}
