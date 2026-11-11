"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { CheckoutError } from "@/lib/paymongo-checkout";
import { reconcileCancelledPayment } from "@/lib/cancelled-payment-reconciliation";

export async function reconcileCancelledRequest(formData: FormData): Promise<
  { success: true; resolved: boolean; message: string } | { success: false; error: string }
> {
  try {
    const actorId = await requireAdmin();
    const input = z.object({ id: z.string().cuid(), version: z.iso.datetime(), reason: z.string().trim().min(5).max(1000) })
      .safeParse({ id: formData.get("requestId"), version: formData.get("expectedVersion"), reason: formData.get("reason") });
    if (!input.success) return { success: false, error: "A request, matching version, and reconciliation reason are required." };
    const result = await reconcileCancelledPayment(input.data.id, actorId, input.data.reason, new Date(input.data.version));
    return { success: true, ...result };
  } catch (error) {
    console.error("[Reconciliation] Could not complete payment review", { error: error instanceof Error ? error.name : "UnknownError" });
    return { success: false, error: error instanceof CheckoutError ? error.message : "Payment review could not be completed. Refresh before trying again; no new refund was submitted." };
  }
}
