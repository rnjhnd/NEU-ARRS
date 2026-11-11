"use server";

import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin, requireEmployeeOrAdmin } from "@/lib/auth";
import { Prisma, RequestStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { enqueueRequestNotification, loadNotificationSettings } from "@/lib/notification-content";
import { scheduleNotificationDelivery } from "@/lib/notification-wakeup";
import { finishCancellationRefunds } from "@/lib/cancellation-refunds";
import { getStatusChangeError, isStatusReversal } from "@/lib/request-workflow";
import { confirmCashCollection, MoneyValidationError } from "@/lib/monetary-ledger";

const UpdateStatusSchema = z.object({
  requestIds: z.array(z.string().cuid()).min(1).max(50).refine(ids => new Set(ids).size === ids.length),
  newStatus: z.nativeEnum(RequestStatus),
  cancelReason: z.string().trim().max(1000).optional(),
  overrideReason: z.string().trim().max(1000).optional(),
  isOverride: z.enum(["true", "false"]).transform(value => value === "true"),
  sendCorrectionEmail: z.enum(["true", "false"]).transform(value => value === "true"),
  confirmCashCollected: z.enum(["true", "false"]).transform(value => value === "true"),
  expectedVersions: z.array(z.object({ id: z.string().cuid(), updatedAt: z.iso.datetime() })).min(1).max(50),
});

class StatusChangeError extends Error {}

export async function updateRequestStatus(formData: FormData) {
  try {
    const adminId = await requireEmployeeOrAdmin();
    const rawIds = formData.getAll("requestIds");
    const rawVersions = formData.get("expectedVersions");
    if (rawIds.length > 50 || typeof rawVersions !== "string" || rawVersions.length > 8000) {
      return { success: false, error: "Invalid input provided. Refresh the queue and try again." };
    }
    let expectedVersions: unknown;
    try { expectedVersions = JSON.parse(rawVersions); }
    catch { return { success: false, error: "Invalid request versions." }; }
    const parsed = UpdateStatusSchema.safeParse({
      requestIds: rawIds,
      newStatus: formData.get("newStatus"),
      cancelReason: formData.get("cancelReason") ?? undefined,
      overrideReason: formData.get("overrideReason") ?? undefined,
      isOverride: formData.get("isOverride") ?? "false",
      sendCorrectionEmail: formData.get("sendCorrectionEmail") ?? "false",
      confirmCashCollected: formData.get("confirmCashCollected") ?? "false",
      expectedVersions,
    });
    if (!parsed.success) return { success: false, error: "Invalid input provided." };
    const { requestIds, newStatus, cancelReason: reason, overrideReason, isOverride, sendCorrectionEmail: shouldSendCorrection, confirmCashCollected } = parsed.data;
    const versions = new Map(parsed.data.expectedVersions.map(version => [version.id, new Date(version.updatedAt)]));
    if (versions.size !== requestIds.length || parsed.data.expectedVersions.length !== requestIds.length || requestIds.some(id => !versions.has(id))) {
      return { success: false, error: "A matching version is required for every selected request." };
    }
    if (isOverride) {
      await requireAdmin();
      if (!overrideReason || overrideReason.length < 5) return { success: false, error: "An override reason of at least 5 characters is required." };
    }
    if (shouldSendCorrection && !isOverride) return { success: false, error: "Correction emails require an administrator override." };
    if (newStatus === "CANCELLED" && !reason) return { success: false, error: "A cancellation reason is required." };

    const changes = await prisma.$transaction(async tx => {
      const requests = await tx.request.findMany({ where: { id: { in: requestIds } } });
      if (requests.length !== requestIds.length) throw new StatusChangeError("One or more requests no longer exist. Refresh the queue.");
      // Validate the entire batch before mutating any row.
      for (const request of requests) {
        if (request.updatedAt.getTime() !== versions.get(request.id)?.getTime()) throw new StatusChangeError("Requests changed. Refresh the queue and try again.");
        const error = getStatusChangeError(request, newStatus, { isOverride, confirmCashCollected });
        if (error) throw new StatusChangeError(error);
      }
      const updated = [];
      const notificationSettings = requests.some(request => !isStatusReversal(request.status, newStatus) || shouldSendCorrection)
        ? await loadNotificationSettings(tx) : [];
      // Stable lock order reduces deadlocks between overlapping batches.
      for (const request of requests.sort((a, b) => a.id.localeCompare(b.id))) {
        const saved = await tx.request.update({
          where: {
            id: request.id, updatedAt: request.updatedAt, status: request.status,
            paymentStatus: request.paymentStatus, paymentMethod: request.paymentMethod,
            paymongoPaymentId: request.paymongoPaymentId,
          },
          data: { status: newStatus, cancelReason: newStatus === "CANCELLED" ? reason : null, notificationVersion: { increment: 1 } },
        });
        const event = await tx.auditLog.create({
          data: {
            adminId, requestId: request.id,
            action: isOverride ? "STATUS_OVERRIDE" : newStatus === "CANCELLED" ? "UPDATE_STATUS_CANCELLED" : "UPDATE_STATUS",
            details: JSON.stringify({
              fromStatus: request.status, toStatus: newStatus, isOverride,
              overrideReason, reason,
              cashCollectedConfirmed: newStatus === "COMPLETED" && request.paymentMethod === "cash" && request.paymentStatus === "CASH_ON_PICKUP" && confirmCashCollected,
              refundRequested: newStatus === "CANCELLED" && request.paymentMethod === "online" && request.paymentStatus === "PAID",
              paymentClosureRequested: newStatus === "CANCELLED" && request.paymentMethod === "online" && request.paymentStatus === "UNPAID",
            }),
          },
        });
        if (newStatus === "COMPLETED" && request.paymentMethod === "cash") await confirmCashCollection(tx, request, event.id, confirmCashCollected);
        if (!isStatusReversal(request.status, newStatus) || shouldSendCorrection) {
          await enqueueRequestNotification(tx, saved, event.id, shouldSendCorrection, notificationSettings);
        }
        updated.push({ before: request, after: saved });
      }
      return updated;
    }, { maxWait: 2000, timeout: 8000 });

    scheduleNotificationDelivery();

    // Financial calls happen after a successful cancellation claim, never
    // inside a retryable database transaction or before the batch commits.
    const { reviewIds } = newStatus === "CANCELLED"
      ? await finishCancellationRefunds(changes.map(change => change.before), adminId, reason!)
      : { reviewIds: [] };


    return {
      success: true,
      changes: changes.map(({ after }) => ({ id: after.id, status: after.status, paymentStatus: after.paymentStatus,
        cancelReason: after.cancelReason, updatedAt: after.updatedAt.toISOString() })),
      warning: reviewIds.length ? `${reviewIds.length} cancelled request(s) need payment closure or refund reconciliation. Use the administrator payment review; do not issue another refund blindly.` : undefined,
    };
  } catch (error) {
    console.error("Failed to update status:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
      return { success: false, error: "Requests changed. Refresh the queue and try again." };
    }
    if (error instanceof StatusChangeError || error instanceof MoneyValidationError || (error instanceof Error && /^(Unauthorized|Forbidden)/.test(error.message))) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update requests. Refresh the queue before retrying." };
  }
}

export async function getDocumentConfigs() {
  const configs = await prisma.documentConfig.findMany({
    orderBy: { createdAt: "asc" }
  });
  
  if (configs.length === 0) {
    // Seed initial values if empty
    const defaultConfigs = [
      { typeId: "TOR", label: "Transcript of Records", description: "Official academic history", price: 15000 },
      { typeId: "GOOD_MORAL", label: "Good Moral Certificate", description: "Behavioral clearance", price: 5000 },
      { typeId: "DIPLOMA", label: "Official Diploma", description: "Graduation certificate", price: 50000 },
      { typeId: "ENROLLMENT", label: "Cert. of Enrollment", description: "Current academic status", price: 10000 }
    ];
    
    await prisma.documentConfig.createMany({ data: defaultConfigs });
    return prisma.documentConfig.findMany({ orderBy: { createdAt: "asc" } });
  }
  
  return configs;
}

export async function updateDocumentConfig(formData: FormData) {
  try {
    await requireAdmin();
    
    const id = formData.get("id") as string;
    const label = formData.get("label") as string;
    const description = formData.get("description") as string;
    const priceStr = formData.get("price") as string;
    const isActiveStr = formData.get("isActive") as string;
    
    if (!id || !label || !description) return { success: false, error: "Missing fields" };
    
    await prisma.documentConfig.update({
      where: { id },
      data: {
        label,
        description,
        price: isNaN(parseInt(priceStr)) ? 0 : parseInt(priceStr) * 100, // convert pesos to centavos
        isActive: isActiveStr === "true"
      }
    });
    
    revalidatePath("/admin/documents");
    revalidatePath("/dashboard/new");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function createDocumentConfig(formData: FormData) {
  try {
    await requireAdmin();
    
    const label = formData.get("label") as string;
    const description = formData.get("description") as string;
    const priceStr = formData.get("price") as string;
    const isActiveStr = formData.get("isActive") as string;
    
    if (!label || !description) return { success: false, error: "Missing fields" };
    
    const finalTypeId = formData.get("typeId") ? (formData.get("typeId") as string) : label;
    
    const newConfig = await prisma.documentConfig.create({
      data: {
        typeId: finalTypeId.toUpperCase().replace(/[^A-Z0-9]/ig, '_'),
        label,
        description,
        price: isNaN(parseInt(priceStr)) ? 0 : parseInt(priceStr) * 100, // convert pesos to centavos
        isActive: isActiveStr === "true"
      }
    });
    
    revalidatePath("/admin/documents");
    revalidatePath("/dashboard/new");
    return { success: true, config: newConfig };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function updateUserRole(userId: string, role: "admin" | "employee" | "student") {
  try {
    const callerId = await requireAdmin();
    
    // Prevent admins from changing their own role (accidental self-demotion)
    if (callerId === userId) {
      return { success: false, error: "You cannot change your own role. Contact another administrator." };
    }
    
    const client = await clerkClient();

    // Prevent demoting the last remaining admin — system must always have at least one
    const targetUser = await client.users.getUser(userId);
    const targetCurrentRole = targetUser.publicMetadata?.role as string | undefined;
    if (targetCurrentRole === "admin" && role !== "admin") {
      const allUsers = await client.users.getUserList({ limit: 500 });
      const adminCount = allUsers.data.filter(
        u => (u.publicMetadata?.role as string) === "admin"
      ).length;
      if (adminCount <= 1) {
        return {
          success: false,
          error: "Cannot demote the last administrator. Promote another user to admin first."
        };
      }
    }
    
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        role: role
      }
    });
    
    // Revoke all active sessions for this user to enforce instant role change
    const sessions = await client.sessions.getSessionList({ userId });
    for (const session of sessions.data) {
      if (session.status === "active") {
        await client.sessions.revokeSession(session.id);
      }
    }
    
    revalidatePath("/admin/settings");
    revalidatePath("/admin/students");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getSystemSetting(key: string) {
  try {
    const setting = await prisma.systemSettings.findUnique({ where: { key } });
    return { success: true, value: setting ? setting.value : null };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function updateSystemSetting(key: string, value: string) {
  try {
    await requireAdmin();
    
    await prisma.systemSettings.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
    
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
