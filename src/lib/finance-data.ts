import { getVerifiedActor, AccessError } from "./auth";
import type { PrismaClient } from "@prisma/client";
import prisma from "./prisma";
import { legacyDocumentLabels } from "./student-request-model";
import { verifiedCollection } from "./monetary-ledger";
import { DEFAULT_FINANCE_QUERY, financeQuerySchema, financeRange, FINANCE_ROW_LIMIT, manilaDay, type FinanceDataset, type FinanceQuery } from "./finance-model";

export class FinanceLoadError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 413 | 503) { super(status === 413 ? "Report exceeds 5,000 requests. Choose a shorter period." : status === 400 ? "Choose dates on or before the report day." : "Administrator access required."); }
}
export async function requireFinanceActor() {
  let actor;
  try { actor = await getVerifiedActor(); } catch (error) { if (error instanceof AccessError) throw new FinanceLoadError(error.status); throw error; }
  if (actor.role !== "admin") throw new FinanceLoadError(403);
  return actor.userId;
}
export const financeSelect = { id: true, documentType: true, purpose: true, paymentMethod: true, paymentStatus: true, status: true, createdAt: true,
  money: { select: { collectedCentavos: true, currency: true, method: true } } } as const;
export async function loadFinanceData(input: FinanceQuery = DEFAULT_FINANCE_QUERY, db: PrismaClient = prisma, now = new Date()): Promise<FinanceDataset> {
  const actorId = await requireFinanceActor();
  const query = financeQuerySchema.parse(input);
  const asOf = now.toISOString();
  if (query.period === "custom" && query.to! > manilaDay(asOf)) throw new FinanceLoadError(400);
  const range = financeRange(query, asOf);
  const rows = await db.request.findMany({ where: { createdAt: { gte: range.start, lt: range.end, lte: now } },
    select: financeSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: FINANCE_ROW_LIMIT + 1 });
  if (rows.length > FINANCE_ROW_LIMIT) throw new FinanceLoadError(413);
  const configs = rows.length ? await db.documentConfig.findMany({ where: { typeId: { in: [...new Set(rows.map(row => row.documentType))] } }, select: { typeId: true, label: true } }) : [];
  const labels = new Map(configs.map(config => [config.typeId, config.label]));
  return { actorId, asOf, query, items: rows.map(row => ({ id: row.id, documentType: labels.get(row.documentType) ?? legacyDocumentLabels[row.documentType] ?? row.documentType.replace(/_/g, " "),
    purpose: row.purpose, paymentMethod: row.paymentMethod, paymentStatus: row.paymentStatus, status: row.status, createdAt: row.createdAt.toISOString(),
    collectedCentavos: verifiedCollection(row.money, row.paymentMethod) })) };
}
