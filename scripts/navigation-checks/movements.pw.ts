import { test as base, expect } from "@playwright/test";
import { startComponentFixture } from "../navigation-fixture/server.mjs";
import { movementQuerySchema, type MovementDataset, type MoneyMovement, type MovementQuery } from "../../src/lib/money-movement-model";
import { financeRange } from "../../src/lib/finance-model";
const asOf = "2026-11-13T12:00:00.000Z";
const id = (index: number) => "c" + String(index).padStart(24, "0");
function row(index: number, dated: boolean): MoneyMovement {
  return { requestId: id(index), kind: index === 2 ? "REFUND" : "COLLECTION", documentTypeId: "TOR", documentLabel: "Synthetic document " + index, method: "online", amountCentavos: 15050,
    occurredAt: dated ? "2026-11-13T00:00:00.000Z" : null, recordedAt: "2026-11-13T01:00:00.000Z", dateBasis: dated ? "PROVIDER_ORIGINAL_EVIDENCE" : "UNKNOWN", version: "a".repeat(64) };
}
type State = { items: MoneyMovement[]; status: number; malformed: boolean; delay: number; dateFails: boolean; dateDelay: number; dates: Record<string, string>[]; reads: number };
const test = base.extend<{ state: State }, { fixtureURL: string }>({
  fixtureURL: [async ({ browserName }, provide) => { if (browserName !== "chromium") throw new Error("Chrome required"); const server = await startComponentFixture("movement-fixture"); try { await provide(server.url); } finally { await server.close(); } }, { scope: "worker" }],
  state: async ({ page, fixtureURL }, provide) => {
    const state: State = { items: [row(1, true), row(2, true), ...Array.from({ length: 13 }, (_, i) => row(i + 3, false))], status: 200, malformed: false, delay: 0, dateFails: false, dateDelay: 600, dates: [], reads: 0 };
    function dataset(query: MovementQuery): MovementDataset {
      const range = financeRange(query, asOf), undated = state.items.filter(item => !item.occurredAt), pages = Math.max(1, Math.ceil(undated.length / 10)), page = Math.min(query.undatedPage, pages);
      return { actorId: "synthetic_admin", asOf, query: { ...query, undatedPage: page }, dated: state.items.filter(item => item.occurredAt && Date.parse(item.occurredAt) <= Date.parse(asOf) && Date.parse(item.occurredAt) < range.end.getTime() && (!range.start || Date.parse(item.occurredAt) >= range.start.getTime())),
        undated: undated.slice((page - 1) * 10, page * 10), undatedPages: pages, undatedSummary: { collections: undated.filter(item => item.kind === "COLLECTION").length, refunds: undated.filter(item => item.kind === "REFUND").length,
          collectionCentavos: undated.filter(item => item.kind === "COLLECTION").reduce((sum, item) => sum + item.amountCentavos, 0), refundCentavos: undated.filter(item => item.kind === "REFUND").reduce((sum, item) => sum + item.amountCentavos, 0) }, missingCollectionEvidence: 1 };
    }
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => new URL(route.request().url()).origin === fixtureURL ? route.continue() : route.abort());
    await page.route("**/fixture/bootstrap", route => route.fulfill({ json: dataset({ period: "7days", undatedPage: 1 }) }));
    await page.route(url => url.pathname === "/api/admin/finance/movements", async route => {
      state.reads++; const params = new URL(route.request().url()).searchParams;
      const query = movementQuerySchema.parse({ period: params.get("period") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, undatedPage: Number(params.get("undatedPage") ?? 1) });
      const body = dataset(query); if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      return route.fulfill({ status: state.status, json: state.malformed ? { error: "invalid successful body" } : body });
    });
    await page.route("**/fixture/date", async route => {
      const body: Record<string, string> = route.request().postDataJSON(); state.dates.push(body); await new Promise(resolve => setTimeout(resolve, state.dateDelay));
      if (state.dateFails) return route.fulfill({ json: { success: false, error: "Synthetic evidence conflict. Refresh before retrying." } });
      state.items = state.items.map(item => item.requestId === body.requestId && item.kind === body.kind ? { ...item, occurredAt: body.occurredAt, dateBasis: "REGISTRAR_ATTESTATION" } : item);
      return route.fulfill({ json: { success: true } });
    });
    await provide(state); expect(errors).toEqual([]);
  },
});
test.beforeEach(async ({ page, fixtureURL, state }) => { expect(state.items.length).toBe(15); await page.goto(fixtureURL); await expect(page.getByRole("button", { name: "Refresh movements", exact: true })).toBeEnabled(); });
test("keeps undated totals separate and pages the global undated list", async ({ page }) => {
  const dated = page.getByRole("region", { name: "Dated money movements", exact: true }), undated = page.getByRole("region", { name: "Undated money movements", exact: true });
  await expect(dated.getByRole("row")).toHaveCount(3); await expect(undated.getByRole("button", { name: /^Record date / })).toHaveCount(10);
  await expect(undated).toContainText("13 collection(s)"); await expect(undated).toContainText("1 request(s) across all dates lack verified collection evidence");
  await page.getByRole("button", { name: "Next undated page", exact: true }).click(); await expect(undated.getByRole("button", { name: /^Record date / })).toHaveCount(3);
  await expect(page.getByText("Undated page 2 / 2", { exact: true })).toBeVisible();
});
test("recording a date requires evidence confirmation and guards duplicate activation", async ({ page, state }) => {
  await page.getByRole("button", { name: "Record date " + id(3) + ":COLLECTION", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Record evidenced transaction date" }); const save = dialog.getByRole("button", { name: "Record evidenced date", exact: true });
  await expect(save).toBeDisabled(); await dialog.getByLabel("Actual occurrence date/time (Manila UTC+08)", { exact: true }).fill("2026-11-13T08:00");
  await dialog.getByLabel("Original evidence reference or review reason", { exact: true }).fill("Original synthetic receipt TEST-001 inspected"); await expect(save).toBeDisabled();
  await dialog.getByRole("checkbox").check(); await save.dblclick(); await expect(dialog).toBeHidden(); expect(state.dates).toHaveLength(1);
  expect(state.dates[0]).toMatchObject({ occurredAt: "2026-11-13T00:00:00.000Z", evidenceChecked: "true" });
  await expect(page.getByRole("region", { name: "Undated money movements", exact: true })).toContainText("12 collection(s)");
  await expect(page.getByRole("region", { name: "Dated money movements", exact: true }).getByRole("row")).toHaveCount(4);
});
test("a rejected date review preserves the draft and releases pending controls", async ({ page, state }) => {
  state.dateFails = true; await page.getByRole("button", { name: "Record date " + id(3) + ":COLLECTION", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Record evidenced transaction date" });
  await dialog.getByLabel("Actual occurrence date/time (Manila UTC+08)", { exact: true }).fill("2026-11-13T08:00"); await dialog.getByLabel("Original evidence reference or review reason", { exact: true }).fill("Original synthetic receipt TEST-001 inspected"); await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Record evidenced date", exact: true }).click(); await expect(dialog.getByRole("alert")).toContainText("evidence conflict");
  await expect(dialog.getByRole("button", { name: "Record evidenced date", exact: true })).toBeEnabled(); await expect(dialog.getByLabel("Original evidence reference or review reason", { exact: true })).toHaveValue("Original synthetic receipt TEST-001 inspected");
});
test("failed and malformed refreshes retain read-only data and recover", async ({ page, state }) => {
  for (const malformed of [false, true]) {
    state.status = malformed ? 200 : 503; state.malformed = malformed;
    await page.getByRole("button", { name: "Refresh movements", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("refresh required");
    await expect(page.getByRole("button", { name: "Export dated movements CSV", exact: true })).toBeDisabled();
    state.status = 200; state.malformed = false; await page.getByRole("button", { name: "Refresh movements", exact: true }).click(); await expect(page.getByRole("alert")).toHaveCount(0);
  }
});
test("filters by transaction dates and disables exports while a custom draft is unapplied", async ({ page }) => {
  await page.getByLabel("Transaction-date period", { exact: true }).selectOption("custom");
  await page.getByLabel("Transaction start date", { exact: true }).fill("2026-11-12"); await page.getByLabel("Transaction end date", { exact: true }).fill("2026-11-12");
  await expect(page.getByRole("button", { name: "Export dated movements CSV", exact: true })).toBeDisabled(); await page.getByRole("button", { name: "Apply dates", exact: true }).click();
  await expect(page.getByRole("region", { name: "Dated money movements", exact: true })).toContainText("No movements in this view.");
  await expect(page.getByRole("region", { name: "Undated money movements", exact: true })).toContainText("13 collection(s)");
});
test("CSV exports clearly distinguish the selected period from the undated current page", async ({ page }) => {
  const datedDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "Export dated movements CSV", exact: true }).click(); expect((await datedDownload).suggestedFilename()).toBe("neu_dated_money_movements.csv");
  const undatedDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "Export undated current page CSV", exact: true }).click(); expect((await undatedDownload).suggestedFilename()).toBe("neu_undated_movements_page.csv");
});
for (const name of ["Switch administrator", "Revoke administrator role"]) test(name + " hides cached private movement data", async ({ page }) => {
  await page.getByRole("button", { name, exact: true }).click(); await expect(page.getByRole("alert")).toContainText("account or role changed"); await expect(page.getByRole("region", { name: "Undated money movements", exact: true })).toHaveCount(0);
});
test("authorization failure hides cached report data", async ({ page, state }) => {
  state.status = 403; await page.getByRole("button", { name: "Refresh movements", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("session changed"); await expect(page.getByRole("region", { name: "Undated money movements", exact: true })).toHaveCount(0);
});
test("phone layout contains horizontal scrolling inside tables and the review dialog fits", async ({ page }, info) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Record date " + id(3) + ":COLLECTION", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "Record evidenced transaction date" });
  await expect(dialog).toBeInViewport({ ratio: 1 }); await page.screenshot({ path: info.outputPath("movement-date-review.png"), animations: "disabled" });
});
