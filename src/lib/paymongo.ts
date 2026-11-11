import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { providerPaidAt, recordCollection } from "./monetary-ledger";

const paymentIdSchema = z.string().regex(/^pay_[a-zA-Z0-9]+$/);
const centavosSchema = z.number().int().min(100).max(2_147_483_647);
const paymentSchema = z.object({
  data: z.object({
    id: paymentIdSchema,
    attributes: z.object({
      amount: centavosSchema,
      currency: z.literal("PHP"),
      status: z.literal("paid"),
      refunds: z.array(z.unknown()).max(1000),
      paid_at: z.number().int().nonnegative().max(253402300799).nullish(),
    }),
  }),
});
const intentSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      payments: z.array(z.object({
        id: paymentIdSchema,
        attributes: z.object({ status: z.string() }),
      })),
    }),
  }),
});
const refundSchema = z.object({
  data: z.object({
    id: z.string().regex(/^ref_[a-zA-Z0-9]+$/),
    attributes: z.object({
      amount: centavosSchema,
      currency: z.literal("PHP"),
      payment_id: paymentIdSchema,
      status: z.enum(["pending", "processing", "succeeded", "failed"]),
    }),
  }),
});

export type RefundResult =
  | { status: "succeeded" | "pending" | "processing"; refundId: string; amountCentavos: number }
  | { status: "failed"; error: string; refundId?: string; amountCentavos?: number };

/**
 * Refund a full payment using PayMongo's authoritative gross centavo amount.
 * Legacy amountPaid and saved quotes never determine refunds. The provider's
 * verified amount is recorded in canonical centavos with the permanent claim.
 */
export async function refundPayment(requestId: string, reason: string): Promise<RefundResult> {
  try {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: { paymongoPaymentId: true, paymentStatus: true, paymentMethod: true, status: true },
    });

    if (!request || !request.paymongoPaymentId || request.paymentStatus !== "PAID" || request.paymentMethod !== "online" || request.status !== "CANCELLED") {
      return { status: "failed", error: "Payment is not eligible for an automatic refund." };
    }

    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey) {
      return { status: "failed", error: "Refund service is not configured." };
    }

    const headers = {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      Accept: "application/json",
    };
    let targetPaymentId = request.paymongoPaymentId;

    // Older records may contain a payment intent instead of a payment ID.
    if (/^pi_[a-zA-Z0-9]+$/.test(targetPaymentId)) {
      const intentRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${targetPaymentId}`, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!intentRes.ok) {
        return { status: "failed", error: "Could not verify the payment intent." };
      }

      const intent = intentSchema.safeParse(await intentRes.json());
      if (!intent.success || intent.data.data.id !== targetPaymentId) {
        return { status: "failed", error: "Invalid payment intent response." };
      }
      const paidPayments = intent.data.data.attributes.payments.filter(payment => payment.attributes.status === "paid");
      if (paidPayments.length !== 1) {
        return { status: "failed", error: "The payment intent requires manual refund review." };
      }
      targetPaymentId = paidPayments[0].id;
    }

    if (!paymentIdSchema.safeParse(targetPaymentId).success) {
      return { status: "failed", error: "Invalid stored payment reference." };
    }

    const paymentRes = await fetch(`https://api.paymongo.com/v1/payments/${targetPaymentId}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!paymentRes.ok) {
      return { status: "failed", error: "Could not verify the original payment." };
    }

    const payment = paymentSchema.safeParse(await paymentRes.json());
    if (!payment.success || payment.data.data.id !== targetPaymentId) {
      return { status: "failed", error: "Invalid or unpaid payment response." };
    }
    const amountCentavos = payment.data.data.attributes.amount;
    if (payment.data.data.attributes.refunds.length !== 0) {
      return { status: "failed", error: "Existing provider refunds require reconciliation. No additional refund was submitted." };
    }
    // A permanent claim survives process crashes and uncertain POST responses.
    // Never delete/reset this claim to retry a refund; reconcile with PayMongo.
    try {
      await prisma.$transaction(async tx => {
        const eligible = await tx.request.updateMany({
          where: { id: requestId, status: "CANCELLED", paymentMethod: "online", paymentStatus: "PAID", paymongoPaymentId: request.paymongoPaymentId },
          data: { updatedAt: new Date() },
        });
        if (eligible.count !== 1) throw new Error("Refund eligibility changed");
        await tx.auditLog.create({ data: {
          id: `refund-claim:${secretKey.startsWith("sk_live_") ? "live" : "test"}:${targetPaymentId}`,
          adminId: "system:refunds", requestId, action: "REFUND_SUBMISSION_CLAIMED",
          details: JSON.stringify({ paymentId: targetPaymentId, amountCentavos, currency: "PHP", paidAt: providerPaidAt(payment.data.data.attributes.paid_at)?.toISOString() ?? null, reason: reason.trim().slice(0, 255) }),
        } });
        await recordCollection(tx, { requestId, method: "online", collectedCentavos: amountCentavos, source: "PAYMONGO_PAYMENT",
          reference: `paymongo:${secretKey.startsWith("sk_live_") ? "live" : "test"}:${targetPaymentId}`,
          evidenceId: `refund-claim:${secretKey.startsWith("sk_live_") ? "live" : "test"}:${targetPaymentId}`, paidAt: providerPaidAt(payment.data.data.attributes.paid_at) });
      }, { maxWait: 2000, timeout: 5000 });
    } catch (error) {
      return { status: "failed", error: error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        ? "A refund was already attempted for this payment. Reconcile it before any further refund."
        : "Refund eligibility could not be claimed. Reconcile before retrying." };
    }

    // Use the Create a Refund API reference contract. Do not retry POSTs here:
    // a timeout can occur after the provider has already accepted a refund.
    const refundRes = await fetch("https://api.paymongo.com/refunds", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountCentavos,
            payment_id: targetPaymentId,
            reason: "requested_by_customer",
            notes: reason.trim().slice(0, 255),
          },
        },
      }),
    });
    if (!refundRes.ok) {
      return { status: "failed", error: "PayMongo did not confirm the refund. Verify it before retrying." };
    }

    const refund = refundSchema.safeParse(await refundRes.json());
    if (!refund.success || refund.data.data.attributes.payment_id !== targetPaymentId || refund.data.data.attributes.amount !== amountCentavos) {
      return { status: "failed", error: "The refund response could not be reconciled. Manual review is required." };
    }

    const { id: refundId, attributes: { status } } = refund.data.data;
    if (status === "failed") {
      return { status, refundId, amountCentavos, error: "PayMongo reported that the refund failed." };
    }
    return { status, refundId, amountCentavos };
  } catch (error) {
    console.error("[Refund] Could not confirm refund", { requestId, error: error instanceof Error ? error.name : "UnknownError" });
    return { status: "failed", error: "Refund could not be confirmed. Verify it with PayMongo before retrying." };
  }
}
