import { Prisma, type PrismaClient } from "@prisma/client";
import prisma from "./prisma";
import { DEFAULT_HISTORY_QUERY, historyQuerySchema, legacyDocumentLabels, REQUEST_PAGE_SIZE, toStudentRequest, type HistoryQuery, type StudentHistory, type StudentRequestRow } from "./student-request-model";

// Only fixed SQL fragments become identifiers/order expressions. Caller values
// (including pagination) are bound parameters.
const documentLabel = Prisma.sql`COALESCE(d."label", CASE r."documentType"
  ${Prisma.join(Object.entries(legacyDocumentLabels).map(([key, label]) => Prisma.sql`WHEN ${key} THEN ${label}`), " ")}
  ELSE replace(r."documentType", '_', ' ') END)`;
const sortColumns = {
  id: Prisma.sql`r."id"`, documentType: Prisma.sql`${documentLabel} COLLATE "C"`,
  purpose: Prisma.sql`r."purpose"::text COLLATE "C"`, updatedAt: Prisma.sql`r."updatedAt"`,
  paymentStatus: Prisma.sql`r."paymentStatus"::text COLLATE "C"`, status: Prisma.sql`r."status"::text COLLATE "C"`,
};
type Summary = StudentHistory["summary"];

export async function loadStudentHistory(studentId: string, input: HistoryQuery = DEFAULT_HISTORY_QUERY, db: PrismaClient = prisma): Promise<StudentHistory> {
  const query = historyQuerySchema.parse(input);
  return db.$transaction(async tx => {
    const [summary] = await tx.$queryRaw<Summary[]>(Prisma.sql`
      SELECT count(*)::int AS total,
        (count(*) FILTER (WHERE "status" NOT IN ('COMPLETED', 'CANCELLED')))::int AS active,
        (count(*) FILTER (WHERE "status" = 'COMPLETED'))::int AS completed
      FROM "Request" WHERE "studentId" = ${studentId}`);
    const totalPages = Math.max(1, Math.ceil(summary.total / REQUEST_PAGE_SIZE));
    const page = Math.min(query.page, totalPages);
    const rows = await tx.$queryRaw<StudentRequestRow[]>(Prisma.sql`
      SELECT r."id", ${documentLabel} AS "documentType", r."purpose", r."paymentMethod",
        r."paymentStatus", r."status", r."cancelReason", r."createdAt", r."updatedAt"
      FROM "Request" r LEFT JOIN "DocumentConfig" d ON d."typeId" = r."documentType"
      WHERE r."studentId" = ${studentId}
      ORDER BY ${sortColumns[query.sort]} ${query.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`}, r."id" ASC
      LIMIT ${REQUEST_PAGE_SIZE} OFFSET ${(page - 1) * REQUEST_PAGE_SIZE}`);
    return { studentId, summary, query: { ...query, page }, totalPages,
      items: rows.map(row => toStudentRequest(row, row.documentType)) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10_000 });
}
