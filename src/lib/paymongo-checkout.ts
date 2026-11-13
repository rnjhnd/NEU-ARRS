import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";

export class CheckoutError extends Error {}

export const paymongoCheckoutId = z.string().max(100).regex(/^cs_[a-zA-Z0-9]+$/);
export const checkoutAmountSchema = z.number().int().min(100).max(2_147_483_647);
export const checkoutSessionSchema = z.object({ data: z.object({
  id: paymongoCheckoutId,
  type: z.literal("checkout_session"),
  attributes: z.object({
    checkout_url: z.string().url(), livemode: z.boolean(), status: z.enum(["active", "expired"]),
    metadata: z.object({ requestId: z.string(), studentId: z.string() }),
    line_items: z.array(z.object({ currency: z.literal("PHP"), amount: checkoutAmountSchema, quantity: z.literal(1) })).length(1),
    payments: z.array(z.object({ attributes: z.object({ status: z.string() }) })),
    payment_intent: z.object({ attributes: z.object({ status: z.string() }) }).nullish(),
  }),
}) });

export function paymongoCheckoutSettings() {
  const key = process.env.PAYMONGO_SECRET_KEY ?? "";
  const mode = /^sk_(test|live)_\S+$/.exec(key);
  if (!mode) throw new CheckoutError("Online payment is not configured. Please contact the registrar.");
  return { livemode: mode[1] === "live", credentialFingerprint: createHash("sha256").update(key).digest("hex"), authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` };
}
