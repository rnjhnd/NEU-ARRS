import type { Request, RequestMoney } from "@prisma/client";
/** Shared pure financial predicates: no datasource, provider or request context. */
export function validCentavos(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647; }
export function verifiedCollection(money: Pick<RequestMoney, "currency" | "method" | "collectedCentavos"> | null | undefined, method: string) {
  return money?.currency === "PHP" && money.method === method && validCentavos(money.collectedCentavos) ? money.collectedCentavos : null;
}
export function isSettledMoneyState(item: Pick<Request, "status" | "paymentMethod" | "paymentStatus">) {
  if (item.status === "CANCELLED" || item.paymentStatus === "REFUNDED") return false;
  return item.paymentMethod === "online" ? item.paymentStatus === "PAID" : item.paymentMethod === "cash" && item.status === "COMPLETED" && ["PAID", "CASH_ON_PICKUP"].includes(item.paymentStatus);
}
