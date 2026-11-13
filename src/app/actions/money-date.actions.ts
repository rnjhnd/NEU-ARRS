"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAdmin, AccessError } from "@/lib/auth";
import { applyMovementDate, DateEvidenceError } from "@/lib/services/movement-dates";
const schema = z.object({ requestId: z.string().cuid(), kind: z.enum(["COLLECTION", "REFUND"]), version: z.string().regex(/^[a-f0-9]{64}$/),
  occurredAt: z.iso.datetime(), reason: z.string().trim().min(10).max(500), evidenceChecked: z.literal("true") });
export async function recordMovementDate(form: FormData) {
  try {
    const actorId = await requireAdmin();
    const fields = ["requestId", "kind", "version", "occurredAt", "reason", "evidenceChecked"];
    if (!(form instanceof FormData) || fields.some(key => form.getAll(key).length !== 1)) return { success: false, error: "Invalid date evidence fields." };
    const input = schema.safeParse(Object.fromEntries(fields.map(key => [key, form.get(key)])));
    if (!input.success) return { success: false, error: "Check the actual date, evidence confirmation and 10–500 character review reference." };
    const occurredAt = new Date(input.data.occurredAt);
    if (occurredAt.getTime() > Date.now() + 300000) return { success: false, error: "An occurrence date cannot be in the future." };
    await applyMovementDate(actorId, input.data, occurredAt);
    return { success: true };
  } catch (error) {
    if (error instanceof AccessError || error instanceof DateEvidenceError) return { success: false, error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2025", "P2034"].includes(error.code)) return { success: false, error: "The date evidence changed. Refresh before reviewing again." };
    console.error("Movement date review unavailable", { type: error instanceof Error ? error.name : "UnknownError" });
    return { success: false, error: "Date review could not be confirmed. Refresh before retrying." };
  }
}
