import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { checkoutPaidSchema, paymongoEventSchema, recordCheckoutPayment } from "@/lib/paymongo-webhook";
import { checkoutNamespaceEnvelope, ownsPaymongoNamespace, PaymongoNamespaceError, paymongoNamespaceSettings } from "@/lib/paymongo-namespace";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 256 * 1024;
const SIGNATURE_TOLERANCE_SECONDS = 300;
class PayloadTooLargeError extends Error {}

async function readRawBody(req: NextRequest): Promise<Buffer> {
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) throw new PayloadTooLargeError();
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}

function isValidSignature(rawBody: Buffer, header: string, secret: string, livemode: boolean): boolean {
  const parts = new Map<string, string>();
  for (const part of header.split(",")) {
    const match = /^(t|te|li)=(.*)$/.exec(part.trim());
    if (!match || parts.has(match[1])) return false;
    parts.set(match[1], match[2]);
  }
  const timestamp = parts.get("t") ?? "";
  const signature = parts.get(livemode ? "li" : "te") ?? "";
  if (!/^\d{1,12}$/.test(timestamp) || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = crypto.createHmac("sha256", secret).update(timestamp).update(".").update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
    const keyMode = /^sk_(test|live)_\S+$/.exec(process.env.PAYMONGO_SECRET_KEY ?? "");
    if (!webhookSecret || !keyMode) {
      return NextResponse.json({ error: "Webhook service is not configured" }, { status: 503 });
    }
    const livemode = keyMode[1] === "live";
    const namespace = paymongoNamespaceSettings();
    const signatureHeader = req.headers.get("Paymongo-Signature");
    if (!signatureHeader) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    const rawBody = await readRawBody(req);
    if (!isValidSignature(rawBody, signatureHeader, webhookSecret, livemode)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    const event = paymongoEventSchema.safeParse(payload);
    if (!event.success || event.data.data.attributes.livemode !== livemode) {
      return NextResponse.json({ error: "Invalid event or environment" }, { status: 400 });
    }

    const { id: eventId, attributes } = event.data.data;
    if (attributes.type !== "checkout_session.payment.paid") {
      return NextResponse.json({ success: true, outcome: "ignored" });
    }
    const routing = checkoutNamespaceEnvelope.safeParse(attributes.data);
    if (!routing.success) return NextResponse.json({ error: "Invalid checkout routing payload" }, { status: 400 });
    if (!ownsPaymongoNamespace(routing.data.attributes.metadata, namespace)) {
      return NextResponse.json({ success: true, outcome: "ignored", reason: "foreign_namespace" });
    }
    const checkout = checkoutPaidSchema.safeParse(attributes.data);
    if (!checkout.success) {
      return NextResponse.json({ error: "Invalid checkout payment payload" }, { status: 400 });
    }

    const result = await recordCheckoutPayment(eventId, livemode, checkout.data);
    if (result.outcome === "review") {
      console.warn("[PayMongo] Payment requires review", { eventId, requestId: checkout.data.attributes.metadata.requestId, reason: result.reason });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof PaymongoNamespaceError) {
      return NextResponse.json({ error: "Webhook service is not configured" }, { status: 503 });
    }
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    console.error("Error processing PayMongo webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
