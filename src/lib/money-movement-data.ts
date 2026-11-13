import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import prisma from "./prisma";
import { requestDocumentLabelSQL } from "./document-identity-sql";
import { requireFinanceActor, FinanceLoadError } from "./finance-data";
import { financeRange, manilaDay } from "./finance-model";
import { DEFAULT_MOVEMENT_QUERY, movementDatasetSchema, movementQuerySchema, MOVEMENT_LIMIT, MOVEMENT_BYTES, UNDATED_PAGE_SIZE, type MovementDataset, type MovementQuery, type MoneyMovement } from "./money-movement-model";

type Row = { requestId: string; kind: "COLLECTION" | "REFUND"; documentTypeId: string; documentLabel: string; method: "online" | "cash"; amountCentavos: number;
  occurredAt: Date | null; recordedAt: Date; dateBasis: MoneyMovement["dateBasis"]; evidenceId: string };
export function movementVersion(requestId: string, kind: string, amount: number, evidenceId: string) {
  return createHash("sha256").update(JSON.stringify([requestId, kind, amount, evidenceId])).digest("hex");
}
const movements = Prisma.sql`WITH movements AS (
  SELECT m."requestId", 'COLLECTION'::text AS kind, r."documentType" AS "documentTypeId", ${requestDocumentLabelSQL} AS "documentLabel", m."method", m."collectedCentavos" AS "amountCentavos",
    m."paidAt" AS "occurredAt", m."verifiedAt" AS "recordedAt", m."evidenceId", 'PROVIDER_ORIGINAL_EVIDENCE'::text AS "dateBasis"
  FROM "RequestMoney" m JOIN "Request" r ON r.id = m."requestId" LEFT JOIN "DocumentConfig" d ON d."typeId" = r."documentType" WHERE m."paidAt" IS NOT NULL
  UNION ALL
  SELECT m."requestId", 'COLLECTION'::text, r."documentType", ${requestDocumentLabelSQL}, m."method", m."collectedCentavos", dt."occurredAt", m."verifiedAt", m."evidenceId",
    CASE WHEN dt."occurredAt" IS NOT NULL THEN 'REGISTRAR_ATTESTATION' ELSE 'UNKNOWN' END
  FROM "RequestMoney" m JOIN "Request" r ON r.id = m."requestId" LEFT JOIN "DocumentConfig" d ON d."typeId" = r."documentType"
  LEFT JOIN "MoneyMovementDate" dt ON dt."requestId" = m."requestId" AND dt.kind = 'COLLECTION'
  WHERE m."paidAt" IS NULL
  UNION ALL
  SELECT m."requestId", 'REFUND'::text, r."documentType", ${requestDocumentLabelSQL}, m."method", m."refundedCentavos", dt."occurredAt", m."refundVerifiedAt", m."refundEvidenceId",
    CASE WHEN dt."occurredAt" IS NOT NULL THEN 'REGISTRAR_ATTESTATION' ELSE 'UNKNOWN' END
  FROM "RequestMoney" m JOIN "Request" r ON r.id = m."requestId" LEFT JOIN "DocumentConfig" d ON d."typeId" = r."documentType"
  LEFT JOIN "MoneyMovementDate" dt ON dt."requestId" = m."requestId" AND dt.kind = 'REFUND'
  WHERE m."refundedCentavos" IS NOT NULL AND m."refundEvidenceId" IS NOT NULL AND m."refundVerifiedAt" IS NOT NULL
)`;
function dto(row: Row): MoneyMovement {
  return { requestId: row.requestId, kind: row.kind, documentTypeId: row.documentTypeId, documentLabel: row.documentLabel, method: row.method, amountCentavos: row.amountCentavos,
    occurredAt: row.occurredAt?.toISOString() ?? null, recordedAt: row.recordedAt.toISOString(), dateBasis: row.dateBasis,
    version: movementVersion(row.requestId, row.kind, row.amountCentavos, row.evidenceId) };
}
export async function loadMoneyMovements(input: MovementQuery = DEFAULT_MOVEMENT_QUERY, db: PrismaClient = prisma, now = new Date()): Promise<MovementDataset> {
  const actorId = await requireFinanceActor(), query = movementQuerySchema.parse(input), asOf = now.toISOString();
  if (query.period === "custom" && query.to > manilaDay(asOf)) throw new FinanceLoadError(400);
  const range = financeRange(query, asOf);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
    const dated = await tx.$queryRaw<Row[]>(Prisma.sql`${movements} SELECT * FROM movements WHERE "occurredAt" <= ${now} AND "occurredAt" < ${range.end}
      ${range.start ? Prisma.sql`AND "occurredAt" >= ${range.start}` : Prisma.empty} ORDER BY "occurredAt", "requestId", kind LIMIT ${MOVEMENT_LIMIT + 1}`);
    if (dated.length > MOVEMENT_LIMIT) throw new FinanceLoadError(413);
    const [summary] = await tx.$queryRaw<{ collections: number; refunds: number; collectionCentavos: string; refundCentavos: string }[]>(Prisma.sql`${movements}
      SELECT (count(*) FILTER (WHERE kind = 'COLLECTION'))::int AS collections, (count(*) FILTER (WHERE kind = 'REFUND'))::int AS refunds,
      COALESCE(sum("amountCentavos") FILTER (WHERE kind = 'COLLECTION'), 0)::text AS "collectionCentavos",
      COALESCE(sum("amountCentavos") FILTER (WHERE kind = 'REFUND'), 0)::text AS "refundCentavos" FROM movements WHERE "occurredAt" IS NULL`);
    const undatedPages = Math.max(1, Math.ceil((summary.collections + summary.refunds) / UNDATED_PAGE_SIZE));
    const page = Math.min(query.undatedPage, undatedPages);
    const undated = await tx.$queryRaw<Row[]>(Prisma.sql`${movements} SELECT * FROM movements WHERE "occurredAt" IS NULL ORDER BY "recordedAt", "requestId", kind LIMIT ${UNDATED_PAGE_SIZE} OFFSET ${(page - 1) * UNDATED_PAGE_SIZE}`);
    const missingCollectionEvidence = await tx.request.count({ where: { money: { is: null }, OR: [{ paymentStatus: { in: ["PAID", "REFUNDED"] } }, { paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "COMPLETED" }] } });
    const data = movementDatasetSchema.parse({ actorId, asOf, query: { ...query, undatedPage: page }, dated: dated.map(dto), undated: undated.map(dto),
      undatedSummary: { ...summary, collectionCentavos: Number(summary.collectionCentavos), refundCentavos: Number(summary.refundCentavos) }, undatedPages, missingCollectionEvidence });
    if (Buffer.byteLength(JSON.stringify(data), "utf8") > MOVEMENT_BYTES) throw new FinanceLoadError(413);
    return data;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 2000, timeout: 10000 });
}
