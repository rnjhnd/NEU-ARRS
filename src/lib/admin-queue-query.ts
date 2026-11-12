import { Prisma } from "@prisma/client";
import { legacyDocumentLabels } from "./student-request-model";
import type { QueueQuery } from "./admin-queue-model";

export const queueDocumentLabel = Prisma.sql`COALESCE(d."label", CASE r."documentType"
  ${Prisma.join(Object.entries(legacyDocumentLabels).map(([key, label]) => Prisma.sql`WHEN ${key} THEN ${label}`), " ")}
  ELSE replace(r."documentType", '_', ' ') END)`;
const sortColumns = { studentName: Prisma.sql`lower(r."studentName") COLLATE "C"`, documentType: Prisma.sql`lower(${queueDocumentLabel}) COLLATE "C"`,
  paymentStatus: Prisma.sql`r."paymentStatus"::text COLLATE "C"`, status: Prisma.sql`r."status"::text COLLATE "C"`, updatedAt: Prisma.sql`r."updatedAt"` };
export function queueWhere(query: QueueQuery, emailIds: string[]) {
  const status = query.status === "ALL" ? Prisma.empty : Prisma.sql`AND r."status" = ${query.status}::"RequestStatus"`;
  if (!query.search) return Prisma.sql`TRUE ${status}`;
  const search = query.search.toLowerCase();
  return Prisma.sql`(strpos(lower(r."id"), ${search}) > 0 OR strpos(lower(r."studentName"), ${search}) > 0
    OR strpos(lower(r."studentNumber"), ${search}) > 0 OR strpos(lower(${queueDocumentLabel}), ${search}) > 0
    OR strpos(lower(replace(r."purpose"::text, '_', ' ')), ${search}) > 0 OR strpos(lower(r."paymentMethod"), ${search}) > 0
    OR strpos(lower(replace(r."paymentStatus"::text, '_', ' ')), ${search}) > 0
    ${emailIds.length ? Prisma.sql`OR r."studentId" IN (${Prisma.join(emailIds)})` : Prisma.empty}) ${status}`;
}
export function queueOrder(query: QueueQuery) {
  return Prisma.sql`${sortColumns[query.sort]} ${query.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`}, r."id" ASC`;
}
