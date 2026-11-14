import "server-only";
import { z } from "zod";

export const paymongoNamespaceSchema = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
export const paymongoNamespaceMetadata = { appNamespace: paymongoNamespaceSchema.optional() };
export type PaymongoNamespacePolicy = { name: string; acceptLegacy: boolean };

export class PaymongoNamespaceError extends Error {
  constructor() { super("Payment environment is not configured."); }
}

/** Legacy sessions belong only to the original application, never a demo. */
export function paymongoNamespaceSettings(): PaymongoNamespacePolicy {
  const namespace = paymongoNamespaceSchema.safeParse(process.env.PAYMONGO_NAMESPACE);
  const legacy = process.env.PAYMONGO_ACCEPT_LEGACY;
  if (!namespace.success || (legacy !== "true" && legacy !== "false") ||
      (legacy === "true" && namespace.data !== "neu-arrs")) throw new PaymongoNamespaceError();
  return { name: namespace.data, acceptLegacy: legacy === "true" };
}

export function ownsPaymongoNamespace(metadata: { appNamespace?: string }, policy: PaymongoNamespacePolicy): boolean {
  return metadata.appNamespace === policy.name || (metadata.appNamespace === undefined && policy.acceptLegacy);
}

// Routing is checked after signature/mode verification, before payment parsing
// or database access. Foreign apps need not share our request-ID schema.
export const checkoutNamespaceEnvelope = z.object({
  id: z.string().max(100).regex(/^cs_[a-zA-Z0-9]+$/), type: z.literal("checkout_session"),
  attributes: z.object({ metadata: z.object(paymongoNamespaceMetadata) }),
});
