"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireEmployeeOrAdmin, AccessError } from "@/lib/auth";
import { applyIdentityReview, IdentityReviewError } from "@/lib/services/identity-review";

const schema = z.object({
  requestId: z.string().cuid(), expectedVersion: z.iso.datetime(),
  decision: z.enum(["verify", "revoke"]),
  reason: z.string().trim().min(10).max(500),
  recordsChecked: z.literal("true"),
}).strict();

export async function reviewRequestIdentity(formData: FormData) {
  try {
    const actorId = await requireEmployeeOrAdmin();
    if (!(formData instanceof FormData)) return { success: false, error: "Invalid identity review." };
    const fields = ["requestId", "expectedVersion", "decision", "reason", "recordsChecked"];
    if (fields.some(key => formData.getAll(key).length !== 1)) return { success: false, error: "Invalid identity review fields." };
    const parsed = schema.safeParse(Object.fromEntries(fields.map(key => [key, formData.get(key)])));
    if (!parsed.success) return { success: false, error: "Confirm the review and provide a reason of 10–500 characters." };
    const input = parsed.data;
    await applyIdentityReview(actorId, input);
    return { success: true };
  } catch (error) {
    if (error instanceof AccessError || error instanceof IdentityReviewError) return { success: false, error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) return { success: false, error: "The request changed. Refresh before reviewing again." };
    console.error("Identity review could not be confirmed", { type: error instanceof Error ? error.name : "UnknownError" });
    return { success: false, error: "Identity review could not be confirmed. Refresh before retrying." };
  }
}
