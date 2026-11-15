import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Request } from "@prisma/client";
import { ownsPaymongoNamespace, paymongoNamespaceMetadata, paymongoNamespaceSettings } from "./paymongo-namespace";

export class CheckoutError extends Error {}

export const paymongoCheckoutId = z.string().max(100).regex(/^cs_[a-zA-Z0-9]+$/);
export const checkoutAmountSchema = z.number().int().min(100).max(2_147_483_647);
export const checkoutMetadataSchema = z.object({ requestId: z.string(), studentId: z.string(), ...paymongoNamespaceMetadata });
export const checkoutSessionSchema = z.object({ data: z.object({
  id: paymongoCheckoutId,
  type: z.literal("checkout_session"),
  attributes: z.object({
    checkout_url: z.string().url(), livemode: z.boolean(), status: z.enum(["active", "expired"]),
    metadata: checkoutMetadataSchema,
    line_items: z.array(z.object({ currency: z.literal("PHP"), amount: checkoutAmountSchema, quantity: z.literal(1) })).length(1),
    payments: z.array(z.object({ id: z.string().max(100).regex(/^pay_[a-zA-Z0-9]+$/).optional(), attributes: z.object({ status: z.string() }) })).max(100),
    payment_intent: z.object({ attributes: z.object({ status: z.string() }) }).nullish(),
  }),
}) });

export function paymongoCheckoutSettings() {
  const key = process.env.PAYMONGO_SECRET_KEY ?? "";
  const mode = /^sk_(test|live)_\S+$/.exec(key);
  if (!mode) throw new CheckoutError("Online payment is not configured. Please contact the registrar.");
  return { livemode: mode[1] === "live", credentialFingerprint: createHash("sha256").update(key).digest("hex"), authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, namespace: paymongoNamespaceSettings() };
}

/** Link a stored payment to an owned checkout before refund/financial mutation. */
export async function verifyPaidCheckoutNamespace(
  order: Pick<Request, "id" | "studentId" | "paymongoCheckoutId" | "quotedAmountCentavos">,
  paymentId: string, settings: ReturnType<typeof paymongoCheckoutSettings>,
): Promise<boolean> {
  // Original historical records may have no checkout reference. Demo records
  // must always prove their namespace; this exception cannot be enabled there.
  if (order.paymongoCheckoutId === null) return settings.namespace.acceptLegacy;
  if (!paymongoCheckoutId.safeParse(order.paymongoCheckoutId).success) return false;
  const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${order.paymongoCheckoutId}`, {
    headers: { Authorization: settings.authorization }, cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return false;
  const parsed = checkoutSessionSchema.safeParse(await response.json());
  if (!parsed.success) return false;
  const session = parsed.data.data, a = session.attributes;
  return session.id === order.paymongoCheckoutId && a.livemode === settings.livemode &&
    ownsPaymongoNamespace(a.metadata, settings.namespace) && a.metadata.requestId === order.id &&
    a.metadata.studentId === order.studentId &&
    (order.quotedAmountCentavos === null || a.line_items[0].amount === order.quotedAmountCentavos) &&
    a.payments.some(payment => payment.id === paymentId && payment.attributes.status === "paid");
}
