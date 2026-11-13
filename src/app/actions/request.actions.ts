"use server";

import { Prisma } from "@prisma/client";
import { requireStudent } from "@/lib/auth";
import { CheckoutError } from "@/lib/checkout";
import { parseCreateRequest, cancelRequestSchema, requestIdSchema } from "@/lib/request-commands";
import { submitStudentRequest, cancelOwnRequest, resumeStudentCheckout, RequestSubmissionError, RequestOperationError } from "@/lib/services/student-requests";
import type { SubmissionResult, CancellationResult, CheckoutResult } from "@/lib/request-results";

export async function createRequest(formData: FormData): Promise<SubmissionResult> {
  try {
    const actorId = await requireStudent();
    const parsed = parseCreateRequest(formData);
    if (!parsed.success) return { success: false, code: "invalid", error: parsed.error };
    return await submitStudentRequest(actorId, parsed.data);
  } catch (error) {
    const requestId = error instanceof RequestSubmissionError ? error.requestId : undefined;
    const cause = error instanceof RequestSubmissionError ? error.cause : error;
    console.error("Failed to submit request", { requestId, error: cause instanceof Error ? cause.name : "UnknownError" });
    return { success: false, requestId, error: cause instanceof CheckoutError ? cause.message : "Request submission could not be confirmed. Check your dashboard before trying again." };
  }
}
export async function cancelStudentRequest(requestId: string, reason: string): Promise<CancellationResult> {
  try {
    const actorId = await requireStudent();
    const parsed = cancelRequestSchema.safeParse({ id: requestId, reason });
    if (!parsed.success) return { success: false, error: "A valid request and cancellation reason are required." };
    return await cancelOwnRequest(actorId, parsed.data.id, parsed.data.reason);
  } catch (error) {
    console.error("Failed to cancel request:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) return { success: false, error: "Request changed. Refresh your dashboard before cancelling." };
    return { success: false, error: error instanceof RequestOperationError ? error.message : "Failed to cancel request." };
  }
}
export async function createRepaymentSession(requestId: string): Promise<CheckoutResult> {
  try {
    const actorId = await requireStudent();
    if (!requestIdSchema.safeParse(requestId).success) return { success: false, error: "Invalid request." };
    return await resumeStudentCheckout(actorId, requestId);
  } catch (error) {
    console.error("Failed to resume payment", { requestId, error: error instanceof Error ? error.name : "UnknownError" });
    return { success: false, error: error instanceof CheckoutError ? error.message : "Payment could not be confirmed. Wait 30 seconds, then retry from your dashboard." };
  }
}
