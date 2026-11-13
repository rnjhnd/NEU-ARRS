"use server";

import { Prisma } from "@prisma/client";
import { requireAdmin, requireEmployeeOrAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { runRoleChange, recoverRoleChange, roleFailure } from "@/lib/role-operations";
import { parseStatusChange } from "@/lib/request-commands";
import { changeRequestStatus, StatusChangeError } from "@/lib/services/staff-requests";
import { MoneyValidationError } from "@/lib/monetary-ledger";
import type { StatusChangeResult } from "@/lib/request-results";

export async function updateRequestStatus(formData: FormData): Promise<StatusChangeResult> {
  try {
    const actorId = await requireEmployeeOrAdmin();
    const parsed = parseStatusChange(formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    let canOverride = false;
    if (parsed.data.isOverride) { await requireAdmin(); canOverride = true; }
    return await changeRequestStatus({ userId: actorId, canOverride }, parsed.data);
  } catch (error) {
    console.error("Failed to update status:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) return { success: false, error: "Requests changed. Refresh the queue and try again." };
    if (error instanceof StatusChangeError || error instanceof MoneyValidationError || error instanceof Error && /^(Unauthorized|Forbidden)/.test(error.message)) return { success: false, error: error.message };
    return { success: false, error: "Failed to update requests. Refresh the queue before retrying." };
  }
}

export async function updateUserRole(userId: string, role: "admin" | "employee" | "student", expectedRole: "admin" | "employee" | "student", intentId: string, expectedOperationId = "unmanaged") {
  try {
    const actorId = await requireAdmin();
    const result = await runRoleChange(actorId, { targetId: userId, previousRole: expectedRole, nextRole: role, intentId, expectedOperationId });
    if (result.success) { try { revalidatePath("/admin/settings"); revalidatePath("/admin/students"); } catch { /* Already committed. */ } }
    return result;
  } catch (error) { return roleFailure(error); }
}
export async function resumeRoleChange(operationId: string) {
  try {
    const actorId = await requireAdmin();
    if (!/^role_[a-f0-9]{64}$/.test(operationId)) return { success: false as const, code: "invalid" as const, error: "Invalid role operation." };
    return await recoverRoleChange(actorId, operationId, undefined, undefined, true);
  } catch (error) { return roleFailure(error); }
}
