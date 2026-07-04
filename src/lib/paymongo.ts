import prisma from "./prisma";

/**
 * Automatically process a PayMongo refund for a given request.
 * It intelligently handles whether the stored ID is a Payment Intent (pi_)
 * or a direct Payment (pay_) and calls the appropriate APIs.
 */
export async function refundPayment(requestId: string, amount: number, reason: string): Promise<boolean> {
  try {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: { paymongoPaymentId: true, paymentStatus: true }
    });

    if (!request || !request.paymongoPaymentId || request.paymentStatus !== "PAID") {
      console.log(`[Refund] Request ${requestId} is not eligible for automatic refund.`);
      return false;
    }

    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey) throw new Error("Missing PAYMONGO_SECRET_KEY");

    const authHeader = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
    let targetPaymentId = request.paymongoPaymentId;

    // If the stored ID is a payment intent (pi_), we must query it to find the nested successful payment (pay_)
    if (targetPaymentId.startsWith("pi_")) {
      const intentRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${targetPaymentId}`, {
        headers: { "Authorization": authHeader, "Accept": "application/json" }
      });
      
      if (!intentRes.ok) {
        console.error(`[Refund] Failed to fetch payment intent: ${targetPaymentId}`);
        return false;
      }

      const intentData = await intentRes.json();
      const payments = intentData.data?.attributes?.payments || [];
      const successfulPayment = payments.find((p: { attributes: { status: string }; id: string }) => p.attributes.status === "paid");

      if (!successfulPayment) {
        console.error(`[Refund] No successful payment found inside intent: ${targetPaymentId}`);
        return false;
      }

      targetPaymentId = successfulPayment.id;
    }

    // Now we have a 'pay_' ID, we can issue the refund
    console.log(`[Refund] Issuing refund for payment: ${targetPaymentId}, amount: ${amount}`);
    
    const refundRes = await fetch("https://api.paymongo.com/refunds", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": authHeader
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amount,
            payment_id: targetPaymentId,
            reason: "requested_by_customer",
            notes: reason
          }
        }
      })
    });

    if (!refundRes.ok) {
      const err = await refundRes.json();
      console.error("[Refund] PayMongo Refund API Error:", err);
      return false;
    }

    console.log(`[Refund] Successfully refunded Request ID: ${requestId}`);
    return true;

  } catch (error) {
    console.error("[Refund] Exception during refund process:", error);
    return false;
  }
}
