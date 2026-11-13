import type { Prisma, Request, RequestMoney } from "@prisma/client";
import "server-only";
import { validCentavos, verifiedCollection } from "./money-policy";
export { validCentavos, verifiedCollection, isSettledMoneyState } from "./money-policy";

export class MoneyValidationError extends Error {}
export function providerPaidAt(value: number | null | undefined) {
  return value !== undefined && value !== null && Number.isInteger(value) && value >= 0 && value * 1000 <= Date.now() + 300_000 ? new Date(value * 1000) : null;
}
type Collection = Pick<RequestMoney, "requestId" | "method" | "collectedCentavos" | "source" | "reference" | "evidenceId"> & { paidAt?: Date | null };
export async function recordCollection(tx: Prisma.TransactionClient, input: Collection) {
  if (!validCentavos(input.collectedCentavos) || (input.method === "online" && input.collectedCentavos < 100)) throw new MoneyValidationError("The verified collection amount is invalid.");
  const existing = await tx.requestMoney.findUnique({ where: { requestId: input.requestId } });
  if (existing) {
    if (existing.currency !== "PHP" || existing.method !== input.method || existing.collectedCentavos !== input.collectedCentavos || existing.reference !== input.reference) throw new MoneyValidationError("Verified money conflicts with this payment. Reconcile the evidence; existing money was not overwritten.");
    if (input.paidAt && existing.paidAt && input.paidAt.getTime() !== existing.paidAt.getTime()) throw new MoneyValidationError("Verified payment dates conflict. No date was overwritten.");
    if (input.paidAt && !existing.paidAt) await tx.requestMoney.update({ where: { requestId: input.requestId, paidAt: null }, data: { paidAt: input.paidAt } });
    return;
  }
  await tx.requestMoney.create({ data: { ...input, paidAt: input.paidAt ?? null, currency: "PHP" } });
}
export async function confirmCashCollection(tx: Prisma.TransactionClient, request: Pick<Request, "id" | "paymentStatus" | "quotedAmountCentavos">, evidenceId: string, confirmed: boolean) {
  const existing = await tx.requestMoney.findUnique({ where: { requestId: request.id } });
  if (existing) {
    if (verifiedCollection(existing, "cash") === null || (validCentavos(request.quotedAmountCentavos) && request.quotedAmountCentavos !== existing.collectedCentavos) || (existing.refundedCentavos !== null && existing.refundedCentavos > 0)) throw new MoneyValidationError("Cash collection requires monetary reconciliation before completion.");
    return;
  }
  if (!confirmed || request.paymentStatus !== "CASH_ON_PICKUP" || !validCentavos(request.quotedAmountCentavos)) throw new MoneyValidationError("A verified cash receipt or saved price and cash-collection confirmation is required. Reconcile historical amounts before completion.");
  await recordCollection(tx, { requestId: request.id, method: "cash", collectedCentavos: request.quotedAmountCentavos, source: "CASH_CONFIRMATION", reference: "cash:" + request.id, evidenceId });
}
export async function recordFullRefund(tx: Prisma.TransactionClient, requestId: string, amountCentavos: number, evidenceId: string) {
  const money = await tx.requestMoney.findUnique({ where: { requestId } });
  if (!money || verifiedCollection(money, "online") === null || amountCentavos !== money.collectedCentavos || amountCentavos <= 0) throw new MoneyValidationError("The verified refund does not match a canonical collection. Reconcile before retrying.");
  if (money.refundedCentavos === amountCentavos) return;
  if (money.refundedCentavos !== null) throw new MoneyValidationError("Recorded refund evidence conflicts. No amount was overwritten.");
  await tx.requestMoney.update({ where: { requestId, refundedCentavos: null }, data: { refundedCentavos: amountCentavos, refundEvidenceId: evidenceId, refundVerifiedAt: new Date() } });
}
