import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("Paymongo-Signature");
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

    if (!signatureHeader || !webhookSecret) {
      return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
    }

    // 1. Verify Cryptographic Signature
    // Paymongo-Signature format: t=1614603956,te=...,li=...
    const signatureParts = signatureHeader.split(",");
    let timestamp = "";
    let testSignature = "";
    let liveSignature = "";

    signatureParts.forEach((part) => {
      const [prefix, value] = part.split("=");
      if (prefix === "t") timestamp = value;
      if (prefix === "te") testSignature = value;
      if (prefix === "li") liveSignature = value;
    });

    const signaturePayload = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(signaturePayload)
      .digest("hex");

    // Check if the expected signature matches either the test or live signature
    if (expectedSignature !== testSignature && expectedSignature !== liveSignature) {
      console.error("Webhook signature verification failed.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 2. Process the Webhook Payload
    const event = JSON.parse(rawBody);

    if (event.data.attributes.type === "checkout.session.payment.paid") {
      const sessionData = event.data.attributes.data;
      const metadata = sessionData.attributes.metadata;
      
      const requestId = metadata?.requestId;

      if (!requestId) {
        console.error("No requestId found in metadata.");
        return NextResponse.json({ error: "Missing metadata.requestId" }, { status: 400 });
      }

      const payments = sessionData.attributes.payments;
      const successfulPayment = payments?.find((p: { attributes: { status: string; amount: number; source?: { type: string } }; id: string }) => p.attributes.status === "paid");

      if (successfulPayment) {
        // 3. Update the Prisma record securely
        await prisma.request.update({
          where: { id: requestId },
          data: {
            status: "PENDING", // Moved from PENDING_PAYMENT to PENDING
            paymentStatus: "PAID",
            paymongoPaymentId: successfulPayment.id,
            paymongoPaymentType: successfulPayment.attributes.source?.type || "unknown",
            amountPaid: successfulPayment.attributes.amount,
          },
        });
        console.log(`Successfully confirmed payment for Request ID: ${requestId}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing PayMongo webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
