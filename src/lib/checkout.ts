import "server-only";
import { Prisma, type Request } from "@prisma/client";
import { z } from "zod";
import prisma from "./prisma";
import { CheckoutError, checkoutSessionSchema as sessionSchema, checkoutAmountSchema as amount, paymongoCheckoutId as sessionId, paymongoCheckoutSettings as providerSettings } from "./paymongo-checkout";
import { reconcileCancelledPayment } from "./cancelled-payment-reconciliation";

export { CheckoutError } from "./paymongo-checkout";
const retryWindowMs = 23 * 60 * 60 * 1000; // Margin before PayMongo's 24-hour key expiry.
const leaseMs = 30_000;
export function checkoutEligible(request: Request, studentId: string) {
  return request.studentId === studentId && request.paymentMethod === "online" &&
    request.status === "PENDING_PAYMENT" && request.paymentStatus === "UNPAID" && request.paymongoPaymentId === null;
}

export async function requireRequestAvailability(method: "online" | "cash") {
  const settings = await prisma.systemSettings.findMany({ where: { key: { in: ["MAINTENANCE_MODE", "PAYMENT_METHODS"] } } });
  const maintenance = settings.find(setting => setting.key === "MAINTENANCE_MODE")?.value;
  if (maintenance !== undefined && !["true", "false"].includes(maintenance)) throw new CheckoutError("Request settings are unavailable. Please try again later.");
  if (maintenance === "true") throw new CheckoutError("The system is under maintenance. Please try again later.");
  const stored = settings.find(setting => setting.key === "PAYMENT_METHODS")?.value;
  let methods = { online: true, cash: true };
  if (stored !== undefined) {
    try { methods = z.object({ online: z.boolean(), cash: z.boolean() }).parse(JSON.parse(stored)); }
    catch { throw new CheckoutError("Payment settings are unavailable. Please contact the registrar."); }
  }
  if (!methods[method]) throw new CheckoutError(`${method === "online" ? "Online" : "Cash"} payment is currently disabled.`);
}

export async function requireDocument(typeId: string, method: "online" | "cash") {
  const config = await prisma.documentConfig.findUnique({ where: { typeId } });
  if (!config?.isActive || !Number.isInteger(config.price) || config.price < (method === "online" ? 100 : 0) || config.price > 2_147_483_647) {
    throw new CheckoutError("This document is unavailable for the selected payment method. Refresh the request form.");
  }
  return config;
}

function payloadFor(request: Request, label: string, quotedAmountCentavos: number) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl) throw new CheckoutError("Online payment return URLs are not configured.");
  const base = new URL(configuredUrl);
  const localDevelopment = process.env.NODE_ENV !== "production" && base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname);
  if (base.username || base.password || (base.protocol !== "https:" && !localDevelopment)) {
    throw new CheckoutError("Online payment return URLs are not configured.");
  }
  return { data: { attributes: {
    send_email_receipt: false, show_description: true, show_line_items: true,
    description: `NEU Document Request - ${request.documentType.replace(/_/g, " ")}`,
    payment_method_types: ["gcash", "paymaya", "card", "dob"],
    line_items: [{ currency: "PHP", amount: quotedAmountCentavos, description: `Purpose: ${request.purpose.replace(/_/g, " ")}`, name: label, quantity: 1 }],
    success_url: `${base.origin}/dashboard?payment=success`, cancel_url: `${base.origin}/dashboard?payment=cancelled`,
    metadata: { requestId: request.id, studentId: request.studentId },
  } } };
}

async function providerRequest(path: string, authorization: string, init?: { payload: Prisma.JsonValue; key: string }) {
  const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions${path}`, {
    method: init ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: authorization, Accept: "application/json", ...(init ? { "Content-Type": "application/json", "Idempotency-Key": init.key } : {}) },
    ...(init ? { body: JSON.stringify(init.payload) } : {}),
  });
  if (!response.ok) throw new CheckoutError("Payment session could not be confirmed. Wait 30 seconds, then retry from your dashboard.");
  return sessionSchema.parse(await response.json()).data;
}

async function prepareAttempt(request: Request, provider: ReturnType<typeof providerSettings>) {
  const existing = await prisma.checkoutAttempt.findUnique({ where: { requestId: request.id } });
  if (existing) return { request, attempt: existing };
  if (request.submissionKey === null) throw new CheckoutError("This older request has no confirmed payment session. Please contact the registrar before paying.");
  const config = await requireDocument(request.documentType, "online");
  const quote = amount.safeParse(request.quotedAmountCentavos);
  if (!quote.success) throw new CheckoutError("The request price requires registrar review.");
  const payload = payloadFor(request, config.label, quote.data);
  try {
    return await prisma.$transaction(async tx => {
      const saved = await tx.request.update({
        where: { id: request.id, studentId: request.studentId, updatedAt: request.updatedAt, paymentMethod: "online", status: "PENDING_PAYMENT", paymentStatus: "UNPAID", paymongoPaymentId: null, paymongoCheckoutId: null },
        data: { quotedAmountCentavos: quote.data },
      });
      const attempt = await tx.checkoutAttempt.create({ data: {
        requestId: request.id, payload, livemode: provider.livemode, credentialFingerprint: provider.credentialFingerprint,
        leaseUntil: new Date(0),
      } });
      return { request: saved, attempt };
    }, { maxWait: 2000, timeout: 8000 });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2002", "P2025", "P2034"].includes(error.code)) throw error;
    throw new CheckoutError("Payment setup is already in progress or the request changed. Refresh your dashboard.");
  }
}

/** One durable attempt per order. Network calls never hold a database transaction. */
export async function resumeCheckout(requestId: string, studentId: string): Promise<string> {
  await requireRequestAvailability("online");
  const found = await prisma.request.findUnique({ where: { id: requestId } });
  if (!found || !checkoutEligible(found, studentId)) throw new CheckoutError("This request is not eligible for online payment. Refresh your dashboard.");
  let request = found;
  const provider = providerSettings();
  let session;
  if (request.paymongoCheckoutId) {
    if (!sessionId.safeParse(request.paymongoCheckoutId).success) throw new CheckoutError("The stored payment session requires registrar review.");
    session = await providerRequest(`/${request.paymongoCheckoutId}`, provider.authorization);
    if (session.id !== request.paymongoCheckoutId) throw new CheckoutError("The payment session requires registrar review.");
  } else {
    const prepared = await prepareAttempt(request, provider);
    request = prepared.request;
    const { attempt } = prepared;
    const now = new Date();
    if (attempt.livemode !== provider.livemode || attempt.credentialFingerprint !== provider.credentialFingerprint || now.getTime() - attempt.createdAt.getTime() >= retryWindowMs || attempt.createdAt > now) {
      throw new CheckoutError("The unconfirmed payment session requires registrar review. Do not submit another payment.");
    }
    const claimed = await prisma.checkoutAttempt.updateMany({
      where: { requestId, leaseUntil: { lte: now }, request: { studentId, status: "PENDING_PAYMENT", paymentStatus: "UNPAID", paymentMethod: "online", paymongoPaymentId: null, paymongoCheckoutId: null } },
      data: { leaseUntil: new Date(now.getTime() + leaseMs) },
    });
    if (claimed.count !== 1) throw new CheckoutError("Payment setup is in progress or the request changed. Wait 30 seconds, then refresh your dashboard.");
    // Exactly the persisted parameters and key are reused, even after config
    // changes, a timeout, a failed local save, or a process restart.
    session = await providerRequest("", provider.authorization, { payload: attempt.payload, key: attempt.idempotencyKey });
  }

  const attributes = session.attributes;
  const url = new URL(attributes.checkout_url);
  if (url.protocol !== "https:" || url.hostname !== "checkout.paymongo.com" || url.port || url.username || url.password ||
      attributes.metadata.requestId !== request.id || attributes.metadata.studentId !== studentId || attributes.livemode !== provider.livemode ||
      (request.quotedAmountCentavos !== null && attributes.line_items[0].amount !== request.quotedAmountCentavos)) {
    throw new CheckoutError("The payment session could not be reconciled. Please contact the registrar.");
  }

  // Keep the provider reference even if cancellation won during the API call.
  // A later webhook can then identify the order and flag its payment for review.
  await prisma.request.updateMany({
    where: { id: requestId, studentId, paymongoCheckoutId: null }, data: { paymongoCheckoutId: session.id },
  });
  const latest = await prisma.request.findUnique({ where: { id: requestId } });
  if (!latest || !checkoutEligible(latest, studentId) || latest.paymongoCheckoutId !== session.id) {
    if (latest?.status === "CANCELLED" && latest.paymongoCheckoutId === session.id) {
      // Cancellation may have committed before an in-flight POST returned its ID.
      // Close the now-known session; this path never submits a refund.
      try { await reconcileCancelledPayment(latest.id, "system:checkout", "Checkout creation completed after cancellation"); }
      catch { console.error("[Checkout] Cancelled session needs reconciliation", { requestId }); }
    }
    throw new CheckoutError("The request changed. Refresh your dashboard before paying.");
  }
  if (attributes.status !== "active") throw new CheckoutError("This payment session has expired. Please contact the registrar before making another payment.");
  if (attributes.payments.some(payment => ["paid", "pending", "processing"].includes(payment.attributes.status)) ||
      ["succeeded", "processing", "cancelled"].includes(attributes.payment_intent?.attributes.status ?? "")) {
    throw new CheckoutError("Payment is already complete or awaiting confirmation. Refresh your dashboard; do not pay again.");
  }
  return attributes.checkout_url;
}
