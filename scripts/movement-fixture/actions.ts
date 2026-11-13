import type { recordMovementDate as RecordDate } from "../../src/app/actions/money-date.actions";
export const recordMovementDate: typeof RecordDate = async form => {
  const response = await fetch("/fixture/date", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }); return response.json();
};
