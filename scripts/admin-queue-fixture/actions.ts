import type { updateRequestStatus as Update } from "../../src/app/actions/admin.actions";
import type { reconcileCancelledRequest as Review } from "../../src/app/actions/payment-reconciliation.actions";

export const updateRequestStatus: typeof Update = async form => {
  const response = await fetch("/fixture/update", { method: "POST", body: JSON.stringify({
    requestIds: form.getAll("requestIds"), expectedVersions: form.get("expectedVersions"), newStatus: form.get("newStatus"),
    cancelReason: form.get("cancelReason"), isOverride: form.get("isOverride"), overrideReason: form.get("overrideReason"),
    confirmCashCollected: form.get("confirmCashCollected"), sendCorrectionEmail: form.get("sendCorrectionEmail"),
  }) });
  return response.json();
};
export const reconcileCancelledRequest: typeof Review = async form => {
  const response = await fetch("/fixture/review", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
  return response.json();
};
