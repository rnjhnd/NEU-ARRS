import "server-only";
import { z } from "zod";
import { checkoutPaidSchema } from "./paymongo-webhook";
import { ownsPaymongoNamespace } from "./paymongo-namespace";
import { paymongoCheckoutSettings } from "./paymongo-checkout";

// The immutable paid-event snapshot can precede the intent's final state and
// the payment list being populated.
// All other fields remain strict; this shape alone never authorizes collection.
const snapshotSchema = checkoutPaidSchema.extend({ attributes: checkoutPaidSchema.shape.attributes.extend({
  payment_intent: checkoutPaidSchema.shape.attributes.shape.payment_intent.extend({
    attributes: checkoutPaidSchema.shape.attributes.shape.payment_intent.shape.attributes.extend({
      status: z.string().min(1).max(64),
    }),
  }),
}) });

export class WebhookVerificationUnavailable extends Error {
  constructor() { super("Payment verification is temporarily unavailable"); }
}

/** Called only after raw signature, environment and namespace routing pass. */
export async function verifyWebhookCheckout(payload: unknown, livemode: boolean) {
  const parsed = checkoutPaidSchema.safeParse(payload);
  if (parsed.success && parsed.data.attributes.payments.length > 0) return parsed;
  const snapshot = snapshotSchema.safeParse(payload);
  if (!snapshot.success) return parsed;
  const s = snapshot.data, a = s.attributes;
  const paid = a.payments.filter(payment => payment.attributes.status === "paid");
  if ((a.payments.length > 0 && paid.length !== 1) || (a.livemode !== undefined && a.livemode !== livemode) ||
      (a.payment_intent.attributes.livemode !== undefined && a.payment_intent.attributes.livemode !== livemode) ||
      (paid[0] && ((paid[0].attributes.livemode !== undefined && paid[0].attributes.livemode !== livemode) ||
        paid[0].attributes.amount !== a.payment_intent.attributes.amount ||
        (paid[0].attributes.payment_intent_id !== undefined && paid[0].attributes.payment_intent_id !== a.payment_intent.id)))) return parsed;
  try {
    const settings = paymongoCheckoutSettings();
    if (settings.livemode !== livemode || !ownsPaymongoNamespace(a.metadata, settings.namespace)) throw new WebhookVerificationUnavailable();
    const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${s.id}`, {
      headers: { Authorization: settings.authorization }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new WebhookVerificationUnavailable();
    const current = checkoutPaidSchema.safeParse((await response.json()).data);
    if (!current.success) throw new WebhookVerificationUnavailable();
    const c = current.data, b = c.attributes, currentPaid = b.payments.filter(payment => payment.attributes.status === "paid");
    if (c.id !== s.id || b.livemode !== livemode || !ownsPaymongoNamespace(b.metadata, settings.namespace) ||
        b.metadata.appNamespace !== a.metadata.appNamespace || b.metadata.requestId !== a.metadata.requestId || b.metadata.studentId !== a.metadata.studentId ||
        b.payment_intent.id !== a.payment_intent.id || b.payment_intent.attributes.amount !== a.payment_intent.attributes.amount ||
        (b.payment_intent.attributes.livemode !== undefined && b.payment_intent.attributes.livemode !== livemode) ||
        currentPaid.length !== 1 || (paid[0] && currentPaid[0].id !== paid[0].id) || currentPaid[0].attributes.amount !== a.payment_intent.attributes.amount ||
        (currentPaid[0].attributes.livemode !== undefined && currentPaid[0].attributes.livemode !== livemode) ||
        currentPaid[0].attributes.payment_intent_id !== b.payment_intent.id) throw new WebhookVerificationUnavailable();
    return current;
  } catch {
    throw new WebhookVerificationUnavailable();
  }
}
