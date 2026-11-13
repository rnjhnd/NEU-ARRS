import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_MOVEMENT_QUERY, movementQuerySchema, movementDatasetSchema, movementURL, movementTotals, movementCSV, type MovementDataset, type MoneyMovement } from "../money-movement-model";
import { fetchMoneyMovements } from "../money-movement-fetcher";

const row: MoneyMovement = { requestId: "synthetic_request", kind: "COLLECTION", documentTypeId: "TOR", documentLabel: "Synthetic document", method: "online", amountCentavos: 15050,
  occurredAt: "2026-11-13T00:00:00.000Z", recordedAt: "2026-11-13T01:00:00.000Z", dateBasis: "PROVIDER_ORIGINAL_EVIDENCE", version: "a".repeat(64) };
const data: MovementDataset = { actorId: "synthetic_admin", asOf: "2026-11-13T12:00:00.000Z", query: DEFAULT_MOVEMENT_QUERY, dated: [row], undated: [],
  undatedPages: 1, undatedSummary: { collections: 0, refunds: 0, collectionCentavos: 0, refundCentavos: 0 }, missingCollectionEvidence: 0 };
beforeEach(() => vi.resetAllMocks());
it("normalizes custom ranges and rejects incomplete/invalid controls without throwing from safeParse", () => {
  expect(movementQuerySchema.parse({ period: "custom", from: "2026-11-13", to: "2026-11-01" })).toEqual({ period: "custom", from: "2026-11-01", to: "2026-11-13", undatedPage: 1 });
  for (const query of [{ period: "custom" }, { period: "bad" }, { period: "custom", from: "2026-02-30", to: "2026-03-01" }, { undatedPage: 0 }]) expect(movementQuerySchema.safeParse(query).success).toBe(false);
});
it("keeps exact collections and refunds separate, preserves zero and excludes undated rows from totals", () => {
  expect(movementTotals([row, { ...row, kind: "REFUND", amountCentavos: 20025 }, { ...row, requestId: "zero", amountCentavos: 0 }, { ...row, occurredAt: null, dateBasis: "UNKNOWN" }])).toEqual({ collections: 15050, refunds: 20025, net: -4975 });
});
it("exports explicit date/basis/scope with safe CSV cells and a blank-date label", () => {
  const csv = movementCSV([{ ...row, documentTypeId: "TOR", documentLabel: '=SUM(1,2)"\nline' }, { ...row, kind: "REFUND", occurredAt: null, dateBasis: "UNKNOWN" }], data.asOf, "Undated current page only");
  expect(csv).toContain("'=SUM(1,2)\"\"\nline"); expect(csv).toContain('"150.50"'); expect(csv).toContain('"2026-11-13 08:00:00.000"'); expect(csv).toContain('"UNKNOWN"'); expect(csv).toContain("Undated current page only");
});
it.each([
  { ...data, dated: [row, row] }, { ...data, dated: [{ ...row, occurredAt: null, dateBasis: "UNKNOWN" }] },
  { ...data, dated: [{ ...row, occurredAt: "2026-11-14T00:00:00Z" }] }, { ...data, dated: [{ ...row, amountCentavos: -1 }] },
  { ...data, undatedPages: 2 }, { ...data, query: { period: "custom", from: "2026-11-13", to: "2026-11-14", undatedPage: 1 } },
])("rejects inconsistent snapshots %#", invalid => { expect(movementDatasetSchema.safeParse(invalid).success).toBe(false); });
it.each([401, 403, 500, 413])("rejects HTTP %i before using data", async status => {
  vi.mocked(fetch).mockResolvedValue(new Response("private error", { status })); await expect(fetchMoneyMovements([movementURL(DEFAULT_MOVEMENT_QUERY), data.actorId])).rejects.toMatchObject({ status });
});
it("validates actor, query, body and redirect boundaries", async () => {
  const url = movementURL(DEFAULT_MOVEMENT_QUERY);
  vi.mocked(fetch).mockImplementation(async () => Response.json(data)); expect(await fetchMoneyMovements([url, data.actorId])).toEqual(data);
  await expect(fetchMoneyMovements([url, "other_admin"])).rejects.toMatchObject({ status: 403 });
  await expect(fetchMoneyMovements([movementURL({ period: "30days", undatedPage: 1 }), data.actorId])).rejects.toMatchObject({ status: 502 });
  vi.mocked(fetch).mockResolvedValue(new Response("not json")); await expect(fetchMoneyMovements([url, data.actorId])).rejects.toMatchObject({ status: 502 });
  const redirected = Response.json(data); Object.defineProperty(redirected, "redirected", { value: true }); vi.mocked(fetch).mockResolvedValue(redirected);
  await expect(fetchMoneyMovements([url, data.actorId])).rejects.toMatchObject({ status: 401 });
});
