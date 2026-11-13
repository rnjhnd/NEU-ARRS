import { z } from "zod";
import { financeQuerySchema, financeRange, manilaDay } from "./finance-model";
import { csvCell } from "./csv";
import { documentIdentityShape } from "./document-identity";

export const MOVEMENT_LIMIT = 5000;
export const UNDATED_PAGE_SIZE = 10;
export const MOVEMENT_BYTES = 3_000_000;
export const movementQuerySchema = z.object({
  period: z.enum(["7days", "30days", "year", "all", "custom"]).default("7days"),
  from: z.iso.date().optional(), to: z.iso.date().optional(),
  undatedPage: z.number().int().min(1).max(1_000_000).default(1),
}).superRefine((input, ctx) => {
  if (input.period === "custom" && (!input.from || !input.to)) ctx.addIssue({ code: "custom", message: "Select both dates." });
}).transform(input => ({ ...financeQuerySchema.parse(input), undatedPage: input.undatedPage }));
export type MovementQuery = z.infer<typeof movementQuerySchema>;
export const DEFAULT_MOVEMENT_QUERY = movementQuerySchema.parse({});
const cents = z.number().int().nonnegative().max(2_147_483_647);
export const movementSchema = z.object({
  requestId: z.string().min(1).max(255), kind: z.enum(["COLLECTION", "REFUND"]),
  ...documentIdentityShape, method: z.enum(["online", "cash"]), amountCentavos: cents,
  occurredAt: z.iso.datetime().nullable(), recordedAt: z.iso.datetime(),
  dateBasis: z.enum(["PROVIDER_ORIGINAL_EVIDENCE", "REGISTRAR_ATTESTATION", "UNKNOWN"]),
  version: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine(item => (item.occurredAt === null) === (item.dateBasis === "UNKNOWN"), "Invalid date basis");
export type MoneyMovement = z.infer<typeof movementSchema>;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const movementDatasetSchema = z.object({
  actorId: z.string().min(1), asOf: z.iso.datetime(), query: movementQuerySchema,
  dated: z.array(movementSchema).max(MOVEMENT_LIMIT), undated: z.array(movementSchema).max(UNDATED_PAGE_SIZE),
  undatedSummary: z.object({ collections: count, refunds: count, collectionCentavos: count, refundCentavos: count }).strict(),
  undatedPages: count.min(1), missingCollectionEvidence: count,
}).strict().superRefine((data, ctx) => {
  const range = financeRange(data.query, data.asOf), asOf = Date.parse(data.asOf);
  if (data.query.period === "custom" && data.query.to > manilaDay(data.asOf)) ctx.addIssue({ code: "custom", message: "Future report period" });
  const seen = new Set<string>();
  for (const item of [...data.dated, ...data.undated]) {
    const key = item.requestId + ":" + item.kind;
    if (seen.has(key) || Date.parse(item.recordedAt) > asOf + 300_000) ctx.addIssue({ code: "custom", message: "Invalid movement snapshot" });
    seen.add(key);
  }
  if (data.dated.some(item => !item.occurredAt || Date.parse(item.occurredAt) > asOf || Date.parse(item.occurredAt) >= range.end.getTime() || (range.start && Date.parse(item.occurredAt) < range.start.getTime())) || data.undated.some(item => item.occurredAt !== null)) ctx.addIssue({ code: "custom", message: "Invalid movement period" });
  const total = data.undatedSummary.collections + data.undatedSummary.refunds;
  if (data.undatedPages !== Math.max(1, Math.ceil(total / UNDATED_PAGE_SIZE)) || data.query.undatedPage > data.undatedPages || data.undated.length !== Math.min(UNDATED_PAGE_SIZE, Math.max(0, total - (data.query.undatedPage - 1) * UNDATED_PAGE_SIZE))) ctx.addIssue({ code: "custom", message: "Invalid undated page" });
});
export type MovementDataset = z.infer<typeof movementDatasetSchema>;
export function movementURL(query: MovementQuery) {
  const clean = movementQuerySchema.parse(query);
  return "/api/admin/finance/movements?" + new URLSearchParams({ format: "money-movements-v2", period: clean.period, undatedPage: String(clean.undatedPage),
    ...(clean.period === "custom" ? { from: clean.from!, to: clean.to! } : {}) });
}
export function movementTotals(items: MoneyMovement[]) {
  const collections = items.filter(item => item.occurredAt !== null && item.kind === "COLLECTION").reduce((sum, item) => sum + item.amountCentavos, 0);
  const refunds = items.filter(item => item.occurredAt !== null && item.kind === "REFUND").reduce((sum, item) => sum + item.amountCentavos, 0);
  return { collections, refunds, net: collections - refunds };
}
export function movementCSV(items: MoneyMovement[], asOf: string, scope: "Dated selected period" | "Undated current page only") {
  return [["Reference ID", "Movement", "Document Type ID", "Document Label", "Method", "Amount (PHP)", "Occurred At (Manila UTC+08)", "Recorded At (UTC)", "Date Basis", "Export Scope", "As Of (UTC)"],
    ...items.map(item => [item.requestId, item.kind, item.documentTypeId, item.documentLabel, item.method, (item.amountCentavos / 100).toFixed(2),
      item.occurredAt ? manilaDay(item.occurredAt) + " " + new Date(Date.parse(item.occurredAt) + 28_800_000).toISOString().slice(11, 23) : "UNKNOWN", item.recordedAt, item.dateBasis, scope, asOf])]
    .map(row => row.map(csvCell).join(",")).join("\r\n");
}
