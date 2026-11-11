import { beforeEach, expect, it, vi } from "vitest";
import { buildFinanceReport, financeCSV, financeDatasetSchema, financeQuerySchema, financeRange, financeURL, formatPHP, isSettledRequest, manilaDay, shiftDay, type FinanceDataset, type FinanceItem } from "../finance-model";
import { fetchFinanceData } from "../finance-fetcher";

const row: FinanceItem = { id: "request_a", documentType: "Document", purpose: "PERSONAL", paymentMethod: "online", paymentStatus: "PAID", status: "PROCESSING", collectedCentavos: 15050, createdAt: "2026-11-10T16:00:00.000Z" };
const dataset: FinanceDataset = { actorId: "admin_a", asOf: "2026-11-11T12:00:00.000Z", query: { period: "7days" }, items: [row] };
beforeEach(() => vi.resetAllMocks());

it("normalizes reversed dates and rejects incomplete or invalid custom queries", () => {
  expect(financeQuerySchema.parse({ period: "custom", from: "2026-11-11", to: "2026-10-30" })).toEqual({ period: "custom", from: "2026-10-30", to: "2026-11-11" });
  for (const query of [{ period: "custom" }, { period: "custom", from: "2026-02-30", to: "2026-03-01" }, { period: "unknown" }]) expect(financeQuerySchema.safeParse(query).success).toBe(false);
  expect(financeQuerySchema.parse({ period: "all", from: "2020-01-01", to: "2021-01-01" })).toEqual({ period: "all" });
});
it("uses fixed Manila boundaries across midnight, month ends and leap days", () => {
  expect(manilaDay("2026-11-10T15:59:59.999Z")).toBe("2026-11-10");
  expect(manilaDay("2026-11-10T16:00:00.000Z")).toBe("2026-11-11");
  const range = financeRange({ period: "7days" }, dataset.asOf);
  expect(range.start?.toISOString()).toBe("2026-11-04T16:00:00.000Z");
  expect(range.end.toISOString()).toBe("2026-11-11T16:00:00.000Z");
  expect(shiftDay("2024-03-01", -1)).toBe("2024-02-29");
  expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
});
it("includes an entire custom end day using an exclusive next-day bound", () => {
  const range = financeRange({ period: "custom", from: "2026-11-10", to: "2026-11-10" }, dataset.asOf);
  expect(range.start?.toISOString()).toBe("2026-11-09T16:00:00.000Z");
  expect(range.end.toISOString()).toBe("2026-11-10T16:00:00.000Z");
});
it("retains exact cents, accepts zero quotes, and flags unknown values without inventing cash", () => {
  const data = { ...dataset, items: [row, { ...row, id: "cash_zero", paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP" as const, status: "COMPLETED" as const, collectedCentavos: 0 },
    { ...row, id: "legacy_cash", paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP" as const, status: "COMPLETED" as const, collectedCentavos: null }] };
  const report = buildFinanceReport(data);
  expect(report).toMatchObject({ total: 15050, online: 15050, cash: 0, knownCount: 2, needsReview: 1 });
  expect(report.settled).toHaveLength(3);
  const csv = financeCSV(data); expect(csv).toContain('"0.00","Verified collection"'); expect(csv).toContain('"","Unverified"');
  expect(csv).not.toContain('"150.00"');
  expect(formatPHP(15050)).toContain("150.50");
});
it("keeps total, method, timeline and document values consistent", () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ ...row, id: String(i), documentType: "Document " + i, collectedCentavos: 10001 + i,
    paymentMethod: i % 2 ? "cash" : "online", paymentStatus: i % 2 ? "CASH_ON_PICKUP" as const : "PAID" as const, status: "COMPLETED" as const }));
  const report = buildFinanceReport({ ...dataset, items });
  for (const points of [report.methods, report.trend, report.documents]) expect(points.reduce((sum, point) => sum + point.centavos, 0)).toBe(report.total);
  expect(report.documents).toHaveLength(13);
  expect(new Set(report.documents.map(point => point.key)).size).toBe(13);
});
it.each([
  [{ status: "CANCELLED", paymentStatus: "PAID" }, false], [{ paymentStatus: "REFUNDED" }, false], [{ paymentStatus: "UNPAID" }, false],
  [{ paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "READY_FOR_PICKUP" }, false],
  [{ paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "COMPLETED" }, true],
] as const)("applies the displayed settled-value policy (%j)", (override, eligible) => {
  expect(isSettledRequest({ ...row, ...override })).toBe(eligible);
});
it("identifies cancelled-paid review records without treating them as settled value", () => {
  const report = buildFinanceReport({ ...dataset, items: [{ ...row, status: "CANCELLED" }] });
  expect(report).toMatchObject({ total: 0, cancelledPaid: 1, excludedCount: 1 });
});
it("does not merge matching month/day labels from different years or invent padding months", () => {
  const report = buildFinanceReport({ ...dataset, query: { period: "all" }, items: [{ ...row, createdAt: "2025-11-10T16:00:00.000Z" }, row] });
  expect(report.trend.map(point => point.key)).toEqual(["2025-11", "2026-11"]);
  expect(report.trend.map(point => point.centavos)).toEqual([15050, 15050]);
  expect(buildFinanceReport({ ...dataset, query: { period: "all" } }).trend).toHaveLength(1);
});
it("keeps this-year buckets monthly in January and omits future months", () => {
  const report = buildFinanceReport({ ...dataset, asOf: "2026-01-05T00:00:00.000Z", query: { period: "year" }, items: [{ ...row, createdAt: "2026-01-02T00:00:00.000Z" }] });
  expect(report.scale).toBe("month"); expect(report.trend).toEqual([{ key: "2026-01", name: "2026-01", centavos: 15050 }]);
});
it("returns real zeros for empty snapshots without treating unknown rows as money", () => {
  const report = buildFinanceReport({ ...dataset, items: [] });
  expect(report).toMatchObject({ total: 0, needsReview: 0, knownCount: 0 }); expect(report.trend).toHaveLength(7);
});
it("exports the same cohort with escaped cells, declared price basis and truthful submitted dates", () => {
  const csv = financeCSV({ ...dataset, items: [{ ...row, documentType: '=HYPERLINK("x")' }, { ...row, id: "excluded", status: "CANCELLED" }] });
  expect(csv).toContain('"\'=HYPERLINK(""x"")"'); expect(csv).toContain('"150.50"'); expect(csv).toContain("2026-11-11");
  expect(csv).not.toContain("Date Paid"); expect(csv).not.toContain("excluded");
});
it("rejects duplicate rows, oversized snapshots, invalid money and dates", () => {
  for (const items of [[row, row], [{ ...row, collectedCentavos: -1 }], [{ ...row, createdAt: "not a date" }], Array.from({ length: 5001 }, (_, i) => ({ ...row, id: String(i) }))]) {
    expect(financeDatasetSchema.safeParse({ ...dataset, items }).success).toBe(false);
  }
});
it("validates response identity, period, future rows and date bounds", async () => {
  const url = financeURL(dataset.query);
  vi.mocked(fetch).mockResolvedValue(Response.json(dataset));
  expect(await fetchFinanceData([url, dataset.actorId])).toEqual(dataset);
  expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ cache: "no-store" }));
  for (const invalid of [{ ...dataset, actorId: "other" }, { ...dataset, query: { period: "all" } },
    { ...dataset, items: [{ ...row, createdAt: "2026-11-12T00:00:00.000Z" }] }, { ...dataset, items: [{ ...row, createdAt: "2025-01-01T00:00:00.000Z" }] }]) {
    vi.mocked(fetch).mockResolvedValue(Response.json(invalid)); await expect(fetchFinanceData([url, dataset.actorId])).rejects.toThrow();
  }
});
it.each([401, 403, 413, 500])("rejects HTTP %s before parsing its body", async status => {
  vi.mocked(fetch).mockResolvedValue(new Response("private failure", { status }));
  await expect(fetchFinanceData([financeURL(dataset.query), dataset.actorId])).rejects.toMatchObject({ status });
});
it("rejects malformed success data and login redirects", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ error: "not data" }));
  await expect(fetchFinanceData([financeURL(dataset.query), dataset.actorId])).rejects.toMatchObject({ status: 502 });
  const redirected = Response.json(dataset); Object.defineProperty(redirected, "redirected", { value: true });
  vi.mocked(fetch).mockResolvedValue(redirected);
  await expect(fetchFinanceData([financeURL(dataset.query), dataset.actorId])).rejects.toMatchObject({ status: 401 });
});
