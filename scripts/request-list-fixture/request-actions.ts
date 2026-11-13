import type { cancelStudentRequest as Cancel, createRepaymentSession as Pay } from "../../src/app/actions/request.actions";

export const cancelStudentRequest: typeof Cancel = async (id, reason) => {
  const response = await fetch("/fixture/cancel", { method: "POST", body: JSON.stringify({ id, reason }) });
  const result: Awaited<ReturnType<typeof Cancel>> = await response.json();
  return result;
};
export const createRepaymentSession: typeof Pay = async id => {
  const response = await fetch("/fixture/pay", { method: "POST", body: JSON.stringify({ id }) });
  return response.json();
};
