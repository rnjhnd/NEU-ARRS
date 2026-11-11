import type { Request } from "@prisma/client";
import prisma from "./prisma";
import { refundPayment, type RefundResult } from "./paymongo";
import { reconcileCancelledPayment } from "./cancelled-payment-reconciliation";
import { recordFullRefund } from "./monetary-ledger";

type CancelledPayment = Pick<Request, "id" | "paymentMethod" | "paymentStatus" | "paymongoPaymentId">;

/** Call only after cancellation and its audit record have committed. */
export async function finishCancellationRefunds(requests: CancelledPayment[], actorId: string, reason: string) {
  const reviewIds: string[] = [];
  const refundedIds: string[] = [];
  const eligible = requests.filter(request => request.paymentMethod === "online" && ["UNPAID", "PAID"].includes(request.paymentStatus));
  const deadline = Date.now() + 30_000;
  const finish = async (request: CancelledPayment) => {
    if (request.paymentStatus === "UNPAID") {
      try {
        const result = await reconcileCancelledPayment(request.id, actorId, reason);
        if (!result.resolved) reviewIds.push(request.id);
      } catch {
        console.error("[Cancellation] Payment closure requires review", { requestId: request.id });
        reviewIds.push(request.id);
      }
      return;
    }
    let refund: RefundResult | undefined;
    try {
      refund = await refundPayment(request.id, reason);
      const result = refund;
      const recorded = await prisma.$transaction(async tx => {
        let confirmed = false;
        if (result.status === "succeeded") {
          const update = await tx.request.updateMany({
            where: {
              id: request.id, status: "CANCELLED", paymentMethod: "online",
              paymentStatus: "PAID", paymongoPaymentId: request.paymongoPaymentId,
            },
            data: { paymentStatus: "REFUNDED" },
          });
          confirmed = update.count === 1;
        }
        await tx.auditLog.create({
          data: {
            id: `refund-result:${request.id}:${result.refundId ?? "unconfirmed"}`,
            adminId: actorId, requestId: request.id,
            action: result.status === "succeeded" && !confirmed ? "REFUND_REVIEW" : `REFUND_${result.status.toUpperCase()}`,
            details: JSON.stringify({ reason, refund: result, confirmed }),
          },
        });
        if (confirmed && result.status === "succeeded") await recordFullRefund(tx, request.id, result.amountCentavos, `refund-result:${request.id}:${result.refundId}`);
        return confirmed;
      });
      if (recorded) refundedIds.push(request.id);
      else reviewIds.push(request.id);
    } catch (error) {
      // Cancellation is already durable. Never report it as failed or retry a
      // financial side effect because persisting its result became uncertain.
      console.error("[Refund] Cancelled request needs reconciliation", { requestId: request.id, refund, error: error instanceof Error ? error.name : "UnknownError" });
      reviewIds.push(request.id);
    }
  };
  let index = 0;
  for (; index < eligible.length && Date.now() < deadline; index += 3) {
    await Promise.all(eligible.slice(index, index + 3).map(finish));
  }
  reviewIds.push(...eligible.slice(index).map(request => request.id));
  return { reviewIds, refundedIds };
}
