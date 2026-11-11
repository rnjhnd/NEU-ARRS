import type { Request } from "@prisma/client";
import { checkoutSessionSchema, paymongoCheckoutId, paymongoCheckoutSettings } from "./paymongo-checkout";

type ExpiryOrder = Pick<Request, "id" | "studentId" | "paymongoCheckoutId" | "quotedAmountCentavos">;
export type ExpiryResult =
  | { kind: "expired"; checkoutId: string; livemode: boolean }
  | { kind: "deferred" | "review"; reason: string };
type Session = ReturnType<typeof checkoutSessionSchema.parse>["data"];

function unsafePayment(session: Session): ExpiryResult | undefined {
  const payments = session.attributes.payments;
  const intent = session.attributes.payment_intent?.attributes.status;
  if (payments.some(payment => payment.attributes.status === "paid") || intent === "succeeded") return { kind: "review", reason: "provider_payment_not_recorded" };
  if (payments.some(payment => ["pending", "processing"].includes(payment.attributes.status)) || intent === "processing") return { kind: "deferred", reason: "payment_in_progress" };
  if (payments.some(payment => !["failed", "cancelled"].includes(payment.attributes.status)) ||
      (intent && !["awaiting_payment_method", "awaiting_next_action", "cancelled"].includes(intent))) return { kind: "review", reason: "unknown_payment_state" };
}

/** Never treats a timeout, 404, or 400 as proof of expiration. */
export async function expireUnpaidCheckout(order: ExpiryOrder): Promise<ExpiryResult> {
  const checkoutId = order.paymongoCheckoutId;
  if (!paymongoCheckoutId.safeParse(checkoutId).success) return { kind: "review", reason: "invalid_checkout_reference" };
  try {
    const { livemode, authorization } = paymongoCheckoutSettings();
    const url = `https://api.paymongo.com/v1/checkout_sessions/${checkoutId}`;
    const headers = { Authorization: authorization, Accept: "application/json" };
    const retrieve = async () => {
      const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Provider retrieval failed");
      const session = checkoutSessionSchema.parse(await response.json()).data;
      if (session.id !== checkoutId || session.attributes.livemode !== livemode ||
          session.attributes.metadata.requestId !== order.id || session.attributes.metadata.studentId !== order.studentId ||
          (order.quotedAmountCentavos !== null && session.attributes.line_items[0].amount !== order.quotedAmountCentavos)) {
        throw new Error("Provider session correlation failed");
      }
      return session;
    };
    let session = await retrieve();
    const blocked = unsafePayment(session);
    if (blocked) return blocked;
    if (session.attributes.status === "active") {
      const response = await fetch(`${url}/expire`, { method: "POST", headers, cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok && response.status !== 400) return { kind: "review", reason: "provider_expiry_unconfirmed" };
      // A 400 can mean already expired, paid, or in flight. Even a 200 must be
      // reconciled against a fresh full resource before the database is changed.
      session = await retrieve();
    }
    const racedPayment = unsafePayment(session);
    if (racedPayment) return racedPayment;
    if (session.attributes.status !== "expired") return { kind: "review", reason: "provider_session_still_active" };
    return { kind: "expired", checkoutId: session.id, livemode };
  } catch {
    return { kind: "review", reason: "provider_session_unverified" };
  }
}
