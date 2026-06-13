"use server";

import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { Purpose, PaymentStatus, RequestStatus } from "@prisma/client";

import { clerkClient } from "@clerk/nextjs/server";
import { sendStatusUpdateEmail } from "@/lib/email";
import { refundPayment } from "@/lib/paymongo";
const CreateRequestSchema = z.object({
  documentType: z.string().min(1),
  purpose: z.nativeEnum(Purpose),
  paymentMethod: z.enum(["online", "cash"]),
});

export async function createRequest(formData: FormData) {
  try {
    // 1. Authenticate the student on the server
    const studentId = await requireAuth();

    // 2. Validate form inputs
    const validatedFields = CreateRequestSchema.safeParse({
      documentType: formData.get("documentType"),
      purpose: formData.get("purpose"),
      paymentMethod: formData.get("paymentMethod"),
    });

    if (!validatedFields.success) {
      return { success: false, error: "Invalid form data. Please check your inputs." };
    }

    const { documentType, purpose, paymentMethod } = validatedFields.data;

    // 3. Determine initial statuses based on payment method
    let paymentStatus: PaymentStatus = PaymentStatus.UNPAID;
    let status: RequestStatus = RequestStatus.PENDING_PAYMENT;

    if (paymentMethod === "cash") {
      paymentStatus = PaymentStatus.CASH_ON_PICKUP;
      status = RequestStatus.PENDING_PAYMENT;
    }

    // 3.5 Fetch Document Config for Dynamic Pricing
    const config = await prisma.documentConfig.findUnique({
      where: { typeId: documentType }
    });
    
    // Fallback to 15000 if not found, though it should exist
    const dynamicPrice = config?.price || 15000;

    // 4. Create the Prisma record
    const newRequest = await prisma.request.create({
      data: {
        studentId,
        documentType,
        purpose,
        paymentMethod,
        paymentStatus,
        status,
        amountPaid: paymentMethod === "cash" ? Math.round(dynamicPrice / 100) : null, // Store cash price immediately for LTV tracking in PHP
      },
    });

    if (paymentMethod === "online") {
      // 5. Create PayMongo Checkout Session
      const paymongoSecretKey = process.env.PAYMONGO_SECRET_KEY;
      if (!paymongoSecretKey) throw new Error("PayMongo secret key is missing.");

      // Base64 encode the secret key for Basic Auth
      const authHeader = `Basic ${Buffer.from(`${paymongoSecretKey}:`).toString("base64")}`;

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      const payload = {
        data: {
          attributes: {
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            description: `NEU Document Request - ${documentType.replace("_", " ")}`,
            payment_method_types: ["gcash", "paymaya", "card", "dob"],
            line_items: [
              {
                currency: "PHP",
                amount: dynamicPrice, // Dynamically fetched amount from DocumentConfig
                description: `Purpose: ${purpose.replace("_", " ")}`,
                name: config?.label || documentType.replace("_", " "),
                quantity: 1,
              },
            ],
            success_url: `${baseUrl}/dashboard?payment=success`,
            cancel_url: `${baseUrl}/dashboard/new?payment=cancelled`,
            metadata: {
              requestId: newRequest.id,
              studentId: studentId,
            },
          },
        },
      };

      const response = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("PayMongo API Error:", errorData);
        throw new Error("Failed to initialize payment session.");
      }

      const responseData = await response.json();
      const checkoutUrl = responseData.data.attributes.checkout_url;
      const checkoutId = responseData.data.id;

      // Update the request with the checkout ID so we can track it if needed
      await prisma.request.update({
        where: { id: newRequest.id },
        data: { paymongoCheckoutId: checkoutId },
      });

      return { success: true, redirectUrl: checkoutUrl, request: newRequest };
    }

    // If cash, just return success
    return { success: true, request: newRequest };
  } catch (error: unknown) {
    console.error("Failed to create request:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to submit request." };
  }
}

export async function cancelStudentRequest(requestId: string, reason: string) {
  try {
    const studentId = await requireAuth();

    // Verify the request belongs to the student and is cancellable
    const request = await prisma.request.findUnique({
      where: { id: requestId },
    });

    if (!request || request.studentId !== studentId) {
      return { success: false, error: "Request not found or unauthorized." };
    }

    if (request.status !== RequestStatus.PENDING_PAYMENT) {
      return { success: false, error: "Only pending requests can be cancelled." };
    }

    let finalPaymentStatus = request.paymentStatus;
    if (request.paymentStatus === "PAID" && request.paymentMethod === "online" && request.amountPaid) {
      const refundSuccess = await refundPayment(requestId, request.amountPaid, reason);
      if (refundSuccess) {
        finalPaymentStatus = PaymentStatus.REFUNDED;
      }
    }

    const updatedRequest = await prisma.request.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.CANCELLED,
        paymentStatus: finalPaymentStatus,
        cancelReason: reason,
      },
    });

    try {
      const client = await clerkClient();
      const user = await client.users.getUser(studentId);
      const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress;
      if (primaryEmail) {
        await sendStatusUpdateEmail(
          primaryEmail,
          user.firstName || "Student",
          request.documentType,
          RequestStatus.CANCELLED,
          reason
        );
      }
    } catch (err) {
      console.error("Failed to send cancellation email", err);
    }

    return { success: true, request: updatedRequest };
  } catch (error: unknown) {
    console.error("Failed to cancel request:", error);
    return { success: false, error: "Failed to cancel request." };
  }
}

export async function createRepaymentSession(requestId: string) {
  try {
    const studentId = await requireAuth();

    const request = await prisma.request.findUnique({
      where: { id: requestId },
    });

    if (!request || request.studentId !== studentId) {
      return { success: false, error: "Request not found or unauthorized." };
    }

    if (request.status !== RequestStatus.PENDING_PAYMENT || request.paymentMethod !== "online") {
      return { success: false, error: "This request is not eligible for online repayment." };
    }

    const config = await prisma.documentConfig.findUnique({
      where: { typeId: request.documentType }
    });

    const dynamicPrice = config?.price || 15000;

    const paymongoSecretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!paymongoSecretKey) throw new Error("PayMongo secret key is missing.");

    const authHeader = `Basic ${Buffer.from(`${paymongoSecretKey}:`).toString("base64")}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const payload = {
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          description: `NEU Document Repayment - ${request.documentType.replace(/_/g, " ")}`,
          payment_method_types: ["gcash", "paymaya", "card", "dob"],
          line_items: [
            {
              currency: "PHP",
              amount: dynamicPrice,
              description: `Purpose: ${request.purpose.replace(/_/g, " ")}`,
              name: config?.label || request.documentType.replace(/_/g, " "),
              quantity: 1,
            },
          ],
          success_url: `${baseUrl}/dashboard?payment=success`,
          cancel_url: `${baseUrl}/dashboard?payment=cancelled`,
          metadata: {
            requestId: request.id,
            studentId: studentId,
          },
        },
      },
    };

    const response = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("PayMongo API Error:", errorData);
      throw new Error("Failed to initialize payment session.");
    }

    const responseData = await response.json();
    const checkoutUrl = responseData.data.attributes.checkout_url;
    const checkoutId = responseData.data.id;

    await prisma.request.update({
      where: { id: request.id },
      data: { paymongoCheckoutId: checkoutId },
    });

    return { success: true, redirectUrl: checkoutUrl };
  } catch (error: unknown) {
    console.error("Failed to create repayment session:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to initialize repayment." };
  }
}

