import "server-only";
import { Prisma } from "@prisma/client";
import { legacyDocumentLabels } from "./document-identity";
/** Shared query adapter: Request alias r, optional DocumentConfig alias d. */
export const requestDocumentLabelSQL = Prisma.sql`COALESCE(d."label", CASE r."documentType"
  ${Prisma.join(Object.entries(legacyDocumentLabels).map(([id, label]) => Prisma.sql`WHEN ${id} THEN ${label}`), " ")}
  ELSE replace(r."documentType", '_', ' ') END)`;
