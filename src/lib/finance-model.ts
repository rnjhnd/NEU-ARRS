import { z } from "zod";
import { studentRequestSchema } from "./student-request-model";
import { csvCell } from "./csv";
import { isSettledMoneyState } from "./monetary-ledger";
export { formatPHP } from "./money-format";

export const FINANCE_URL = "/api/admin/finance?format=finance-v2";
export const FINANCE_ROW_LIMIT = 5000;
export const REPORT_TIME_ZONE = "Manila (UTC+08:00)";
const DAY = 86_400_000;
export const financeQuerySchema = z.object({
  period: z.enum(["7days", "30days", "year", "all", "custom"]).default("7days"),
  from: z.iso.date().optional(), to: z.iso.date().optional(),
}).superRefine((query, ctx) => {
  if (query.period === "custom" && (!query.from || !query.to)) ctx.addIssue({ code: "custom", message: "Select both dates." });
}).transform(query => query.period === "custom" ? { period: "custom" as const, from: query.from! < query.to! ? query.from! : query.to!, to: query.from! < query.to! ? query.to! : query.from! } : { period: query.period });
export type FinanceQuery = z.infer<typeof financeQuerySchema>;
export const DEFAULT_FINANCE_QUERY = financeQuerySchema.parse({});
export const financeItemSchema = studentRequestSchema.pick({ id: true, documentType: true, purpose: true, paymentMethod: true, paymentStatus: true, status: true, createdAt: true })
  .extend({ collectedCentavos: z.number().int().nonnegative().max(2_147_483_647).nullable() });
export type FinanceItem = z.infer<typeof financeItemSchema>;
export const financeDatasetSchema = z.object({ actorId: z.string().min(1), asOf: z.iso.datetime(), query: financeQuerySchema, items: z.array(financeItemSchema).max(FINANCE_ROW_LIMIT) })
  .refine(data => new Set(data.items.map(item => item.id)).size === data.items.length, "Duplicate requests");
export type FinanceDataset = z.infer<typeof financeDatasetSchema>;

export function manilaDay(instant: string) { return new Date(Date.parse(instant) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10); }
export function shiftDay(day: string, offset: number) { return new Date(Date.parse(day + "T00:00:00Z") + offset * DAY).toISOString().slice(0, 10); }
export function financeRange(query: FinanceQuery, asOf: string) {
  const today = manilaDay(asOf);
  const from = query.period === "7days" ? shiftDay(today, -6) : query.period === "30days" ? shiftDay(today, -29) : query.period === "year" ? today.slice(0, 4) + "-01-01" : query.period === "custom" ? query.from : undefined;
  const to = query.period === "custom" ? query.to! : today;
  return { from, to, start: from ? new Date(from + "T00:00:00+08:00") : undefined, end: new Date(shiftDay(to, 1) + "T00:00:00+08:00") };
}
export function financeURL(query: FinanceQuery) {
  const clean = financeQuerySchema.parse(query);
  return FINANCE_URL + "&" + new URLSearchParams({ period: clean.period, ...(clean.period === "custom" ? { from: clean.from!, to: clean.to! } : {}) });
}
export function isSettledRequest(item: FinanceItem) {
  return isSettledMoneyState(item);
}
export type FinancePoint = { key: string; name: string; centavos: number };
export function buildFinanceReport(data: FinanceDataset) {
  const range = financeRange(data.query, data.asOf);
  const days = range.from ? Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY) + 1 : Infinity;
  const first = data.items.reduce((day, item) => manilaDay(item.createdAt) < day ? manilaDay(item.createdAt) : day, manilaDay(data.asOf));
  const spanMonths = (Number(range.to.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(range.to.slice(5, 7)) - Number(first.slice(5, 7));
  const scale = data.query.period === "year" ? "month" : days <= 31 ? "day" : spanMonths <= 120 ? "month" : "year";
  const trend = new Map<string, number>();
  if (scale === "day") for (let i = 0; i < Math.max(0, days); i++) trend.set(shiftDay(range.from!, i), 0);
  if (data.query.period === "year") for (let i = 1; i <= Number(range.to.slice(5, 7)); i++) trend.set(range.to.slice(0, 4) + "-" + String(i).padStart(2, "0"), 0);
  const documents = new Map<string, number>();
  const settled: FinanceItem[] = [];
  let total = 0, online = 0, cash = 0, needsReview = 0, cancelledPaid = 0;
  for (const item of data.items) {
    if (item.status === "CANCELLED" && item.paymentStatus === "PAID") cancelledPaid++;
    if (!isSettledRequest(item)) continue;
    settled.push(item);
    const day = manilaDay(item.createdAt);
    const key = scale === "day" ? day : scale === "month" ? day.slice(0, 7) : day.slice(0, 4);
    if (!trend.has(key)) trend.set(key, 0);
    if (item.collectedCentavos === null) { needsReview++; continue; }
    total += item.collectedCentavos;
    if (item.paymentMethod === "online") online += item.collectedCentavos; else cash += item.collectedCentavos;
    trend.set(key, trend.get(key)! + item.collectedCentavos);
    documents.set(item.documentType, (documents.get(item.documentType) ?? 0) + item.collectedCentavos);
  }
  const byDocument = [...documents].map(([name, centavos]) => ({ key: "document:" + name, name, centavos })).sort((a, b) => b.centavos - a.centavos || a.name.localeCompare(b.name));
  const displayDocuments = byDocument.length <= 12 ? byDocument : [...byDocument.slice(0, 12), { key: "other-documents", name: "Other documents", centavos: byDocument.slice(12).reduce((sum, item) => sum + item.centavos, 0) }];
  return { range, scale, total, online, cash, needsReview, cancelledPaid, settled, knownCount: settled.length - needsReview,
    excludedCount: data.items.length - settled.length,
    trend: [...trend].sort(([a], [b]) => a.localeCompare(b)).map(([key, centavos]) => ({ key, name: key, centavos })),
    methods: [{ key: "online", name: "Online", centavos: online }, { key: "cash", name: "Cash on Pickup", centavos: cash }], documents: displayDocuments };
}
export type FinanceReport = ReturnType<typeof buildFinanceReport>;
export function financeCSV(data: FinanceDataset) {
  const report = buildFinanceReport(data);
  const headers = ["Reference ID", "Document", "Purpose", "Payment Method", "Payment Status", "Request Status", "Submitted Date (Manila UTC+08)", "Settled Request Value (PHP)", "Value Basis", "Review", "Report As Of (UTC)"];
  return [headers, ...report.settled.map(item => [item.id, item.documentType, item.purpose, item.paymentMethod, item.paymentStatus, item.status,
    manilaDay(item.createdAt), item.collectedCentavos === null ? "" : (item.collectedCentavos / 100).toFixed(2), item.collectedCentavos === null ? "Unverified" : "Verified collection",
    item.collectedCentavos === null ? "Original collection evidence requires review" : "", data.asOf])].map(row => row.map(csvCell).join(",")).join("\r\n");
}
