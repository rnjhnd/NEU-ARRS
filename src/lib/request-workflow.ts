import type { Request, RequestStatus } from "@prisma/client";

export const ALLOWED_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  PENDING_PAYMENT: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

const STATUS_ORDER: Record<RequestStatus, number> = {
  PENDING_PAYMENT: 0, PROCESSING: 1, READY_FOR_PICKUP: 2, COMPLETED: 3, CANCELLED: 4,
};

export function isStatusReversal(from: RequestStatus, to: RequestStatus) {
  return STATUS_ORDER[to] < STATUS_ORDER[from];
}

export function isAllowedTransition(from: RequestStatus, to: RequestStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

type WorkflowRequest = Pick<Request, "status" | "paymentStatus" | "paymentMethod"> & { identityVerified?: boolean };

/** Shared display/server policy. Authorization is always enforced by the action. */
export function getStatusChangeError(
  request: WorkflowRequest,
  next: RequestStatus,
  { isOverride = false, confirmCashCollected = false } = {},
): string | null {
  if (request.status === next) return "The request already has this status.";
  if (!isOverride && !isAllowedTransition(request.status, next)) return "Illegal state transition. An administrator override is required.";
  if (next === "CANCELLED") return null;
  if (request.paymentStatus === "REFUNDED") return "Refunded requests cannot be reopened or fulfilled. Create a new request.";
  if (request.status === "CANCELLED" && request.paymentMethod === "online") {
    return "Cancelled online requests require payment/refund reconciliation and cannot be reopened. Create a new request.";
  }
  if (next === "PENDING_PAYMENT") {
    return request.paymentMethod === "online" && request.paymentStatus === "PAID"
      ? "Paid online requests cannot return to awaiting payment."
      : null;
  }
  if (request.identityVerified !== true) return "Registrar verification against school records is required before fulfillment.";
  if (request.paymentMethod === "online") {
    return request.paymentStatus === "PAID" ? null : "Online payment must be verified before fulfillment.";
  }
  if (request.paymentMethod === "cash" && (request.paymentStatus === "CASH_ON_PICKUP" || request.paymentStatus === "PAID")) {
    return next === "COMPLETED" && request.paymentStatus === "CASH_ON_PICKUP" && !confirmCashCollected
      ? "Confirm that cash payment has been collected before completing this request."
      : null;
  }
  return "This request has an ineligible payment state.";
}
