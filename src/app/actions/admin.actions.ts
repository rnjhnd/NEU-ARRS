"use server";

import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { RequestStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";

const UpdateStatusSchema = z.object({
  requestIds: z.array(z.string().cuid()),
  newStatus: z.nativeEnum(RequestStatus),
  cancelReason: z.string().optional(),
});

const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  PENDING_PAYMENT: [RequestStatus.CANCELLED],
  PENDING: [RequestStatus.PROCESSING, RequestStatus.CANCELLED],
  PROCESSING: [RequestStatus.READY_FOR_PICKUP, RequestStatus.CANCELLED],
  READY_FOR_PICKUP: [RequestStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};

export async function updateRequestStatus(formData: FormData) {
  try {
    // 1. Strict Server-Side Authorization
    await requireAdmin();

    // 2. Extract and Validate Input
    const rawIds = formData.getAll("requestIds") as string[];
    const rawStatus = formData.get("newStatus") as string;
    const cancelReason = (formData.get("cancelReason") as string) || undefined;

    const validatedFields = UpdateStatusSchema.safeParse({
      requestIds: rawIds,
      newStatus: rawStatus,
      cancelReason,
    });

    if (!validatedFields.success) {
      return { success: false, error: "Invalid input provided." };
    }

    const { requestIds, newStatus, cancelReason: reason } = validatedFields.data;

    if (newStatus === RequestStatus.CANCELLED && (!reason || reason.trim() === "")) {
      return { success: false, error: "A cancellation reason is required." };
    }

    // 3. Fetch current requests to validate state transitions
    const requestsToUpdate = await prisma.request.findMany({
      where: { id: { in: requestIds } },
      select: { id: true, status: true },
    });

    // 4. Validate allowed status transitions
    for (const req of requestsToUpdate) {
      const allowedNextStates = ALLOWED_TRANSITIONS[req.status];
      if (!allowedNextStates.includes(newStatus)) {
        return { 
          success: false, 
          error: `Illegal state transition for request ${req.id}. Cannot move from ${req.status} to ${newStatus}.` 
        };
      }
    }

    // 5. Execute Bulk Update
    await prisma.request.updateMany({
      where: { id: { in: requestIds } },
      data: {
        status: newStatus,
        ...(newStatus === RequestStatus.CANCELLED ? { cancelReason: reason } : {}),
      },
    });

    // 6. Revalidate cache
    revalidatePath("/admin");
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to update status:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update status." };
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
        price: parseInt(priceStr) * 100, // convert pesos to centavos
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
        price: parseInt(priceStr) * 100, // convert pesos to centavos
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

export async function grantAdminRole(userId: string, grant: boolean) {
  try {
    await requireAdmin();
    const client = await clerkClient();
    
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        role: grant ? "admin" : "student"
      }
    });
    
    revalidatePath("/admin/settings");
    revalidatePath("/admin/students");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
