import { test as base, expect, type Page } from "@playwright/test";
import { readFile, copyFile } from "node:fs/promises";
import { startComponentFixture } from "../navigation-fixture/server.mjs";
import { financeQuerySchema, financeRange, type FinanceDataset, type FinanceItem, type FinanceQuery } from "../../src/lib/finance-model";

const asOf = "2026-11-11T12:00:00.000Z";
function rows(): FinanceItem[] {
  const item: FinanceItem = { id: "online", documentType: "Document", purpose: "PERSONAL", paymentMethod: "online", paymentStatus: "PAID", status: "PROCESSING", collectedCentavos: 15050, createdAt: "2026-11-10T16:00:00.000Z" };
  return [item, { ...item, id: "zero_cash", paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "COMPLETED", collectedCentavos: 0, createdAt: "2026-11-09T16:00:00.000Z" },
    { ...item, id: "cash", paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "COMPLETED", collectedCentavos: 20025, createdAt: "2026-11-10T15:59:59.999Z" },
    { ...item, id: "legacy", collectedCentavos: null, createdAt: "2026-11-08T00:00:00.000Z" }, { ...item, id: "cancelled", status: "CANCELLED" },
    { ...item, id: "refunded", paymentStatus: "REFUNDED" }, { ...item, id: "unpaid", paymentStatus: "UNPAID", status: "PENDING_PAYMENT" },
    { ...item, id: "prior_year", collectedCentavos: 99999, createdAt: "2025-11-10T16:00:00.000Z" },
    { ...item, id: "future", collectedCentavos: 90000, createdAt: "2026-11-12T00:00:00.000Z" }];
}
type State = { items: FinanceItem[]; status: number; malformed: boolean; delay: number; oversized: boolean; unavailable: boolean; reads: string[] };
const test = base.extend<{ state: State }, { fixtureURL: string }>({
  fixtureURL: [async ({ browserName }, provide) => {
    if (browserName !== "chromium") throw new Error("Chrome required");
    const server = await startComponentFixture("finance-fixture");
    try { await provide(server.url); } finally { await server.close(); }
  }, { scope: "worker" }],
  state: async ({ page, fixtureURL }, provide) => {
    const state: State = { items: rows(), status: 200, malformed: false, delay: 0, oversized: false, unavailable: false, reads: [] };
    const dataset = (query: FinanceQuery): FinanceDataset => {
      const range = financeRange(query, asOf);
      return { actorId: "admin_synthetic", asOf, query, items: state.items.filter(item => Date.parse(item.createdAt) <= Date.parse(asOf) && (!range.start || Date.parse(item.createdAt) >= range.start.getTime()) && Date.parse(item.createdAt) < range.end.getTime()) };
    };
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => { if (new URL(route.request().url()).origin === fixtureURL) return route.continue(); errors.push("Unexpected outbound request"); return route.abort(); });
    await page.route("**/fixture/bootstrap", route => route.fulfill({ json: { actorId: "admin_synthetic", data: state.unavailable ? undefined : dataset({ period: "7days" }), unavailable: state.unavailable } }));
    await page.route(url => url.pathname === "/api/admin/finance", async route => {
      const params = new URL(route.request().url()).searchParams;
      state.reads.push(params.toString());
      const query = financeQuerySchema.parse({ period: params.get("period") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined });
      const data = dataset(query); if (state.delay) await new Promise(done => setTimeout(done, state.delay));
      return route.fulfill({ status: state.oversized && query.period === "all" ? 413 : state.status, json: state.malformed ? { error: "bad successful response" } : data });
    });
    await provide(state); expect(errors).toEqual([]);
  },
});
test.use({ timezoneId: "America/Los_Angeles" }); // All report days must still be Manila days.
test.beforeEach(async ({ page, fixtureURL, state }) => { expect(state.items).toHaveLength(9); await page.goto(fixtureURL); await page.waitForLoadState("networkidle"); await expect(page.getByText("Known Settled Value", { exact: true })).toBeVisible(); });
const kpi = (page: Page, label: string) => page.getByText(label, { exact: true }).locator("..");

test("cards, warnings and declared Manila cohort reflect exact prices and real zeros", async ({ page }) => {
  await expect(kpi(page, "Known Settled Value")).toContainText("350.75"); await expect(kpi(page, "Online Settled Value")).toContainText("150.50");
  await expect(kpi(page, "Cash Settled Value")).toContainText("200.25"); await expect(kpi(page, "Settled Requests")).toContainText("4");
  await expect(page.getByText("1 settled request(s) need amount review", { exact: false })).toBeVisible();
  await expect(page.getByText("1 cancelled request(s) are still marked paid", { exact: false })).toBeVisible();
  await expect(page.getByText("Submitted dates: 2026-11-05 to 2026-11-11, Manila (UTC+08:00).", { exact: true })).toBeVisible();
});
test("custom ranges normalize reversed days and block exports while dates are unapplied", async ({ page }) => {
  await page.getByLabel("Submitted-date period").selectOption("custom"); await expect(page.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  await page.getByLabel("From", { exact: true }).fill("2026-11-11"); await page.getByLabel("To (inclusive)").fill("2026-11-10");
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-11-10"); await expect(page.getByLabel("To (inclusive)")).toHaveValue("2026-11-11");
  await expect(kpi(page, "Known Settled Value")).toContainText("350.75");
  await page.getByLabel("From", { exact: true }).fill("2026-11-11"); await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(kpi(page, "Known Settled Value")).toContainText("150.50");
  await page.getByLabel("To (inclusive)").fill(""); await expect(page.getByRole("button", { name: "Export PNG" })).toBeDisabled();
});
test("all-time/current-year requests use server filters and keep prior years distinct", async ({ page, state }) => {
  await page.getByLabel("Submitted-date period").selectOption("all"); await expect(kpi(page, "Known Settled Value")).toContainText("1,350.74");
  expect(state.reads.some(query => query.includes("period=all"))).toBe(true);
  await page.getByLabel("Submitted-date period").selectOption("year"); await expect(kpi(page, "Known Settled Value")).toContainText("350.75");
  await expect(page.getByText("Submitted dates: 2026-01-01 to 2026-11-11, Manila (UTC+08:00).", { exact: true })).toBeVisible();
});
test("failed or malformed refresh keeps verified data and blocks stale exports until recovery", async ({ page, state }) => {
  for (const malformed of [false, true]) {
    state.status = malformed ? 200 : 500; state.malformed = malformed;
    await page.getByRole("button", { name: "Refresh report" }).click(); await expect(page.getByRole("alert")).toContainText("could not be refreshed");
    await expect(kpi(page, "Known Settled Value")).toContainText("350.75"); await expect(page.getByRole("button", { name: "Export CSV" })).toBeDisabled();
    state.status = 200; state.malformed = false; await page.getByRole("button", { name: "Refresh report" }).click(); await expect(page.getByRole("alert")).toHaveCount(0);
  }
});
test("oversized reports fail explicitly and recover after narrowing the period", async ({ page, state }) => {
  state.oversized = true; await page.getByLabel("Submitted-date period").selectOption("all");
  await expect(page.getByRole("alert")).toContainText("exceeds 5,000 requests"); await expect(page.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  await page.getByLabel("Submitted-date period").selectOption("7days"); await expect(page.getByRole("button", { name: "Export CSV" })).toBeEnabled();
});
test("a failed initial snapshot shows no fabricated totals and can recover", async ({ page, state }) => {
  state.unavailable = true; state.status = 500; await page.reload(); await page.waitForLoadState("networkidle");
  await expect(page.getByRole("alert")).toBeVisible(); await expect(page.getByText("Known Settled Value", { exact: true })).toHaveCount(0);
  state.status = 200; await page.getByRole("button", { name: "Refresh report" }).click(); await expect(kpi(page, "Known Settled Value")).toContainText("350.75");
});
test("CSV reflects the applied cohort, escaped labels, zero prices and review rows", async ({ page, state }) => {
  state.items[0] = { ...state.items[0], documentType: '=HYPERLINK("x")' }; await page.getByRole("button", { name: "Refresh report" }).click();
  const downloaded = page.waitForEvent("download"); await page.getByRole("button", { name: "Export CSV" }).click();
  const path = await (await downloaded).path(); if (!path) throw new Error("No CSV path"); const csv = await readFile(path, "utf8");
  expect(csv).toContain('"\'=HYPERLINK(""x"")"'); expect(csv).toContain('"150.50"'); expect(csv).toContain('"0.00"'); expect(csv).toContain('"","Unverified"');
  expect(csv).toContain("2026-11-11"); expect(csv).not.toContain("Date Paid"); expect(csv).not.toContain('"future"'); expect(csv).not.toContain('"cancelled"');
});
test("PNG exports the real charts, metadata and warnings while freezing report controls", async ({ page }, info) => {
  await page.route(url => url.pathname.includes("html-to-image"), async route => { await new Promise(done => setTimeout(done, 600)); return route.continue(); });
  const downloaded = page.waitForEvent("download"); const png = page.getByRole("button", { name: "Export PNG" }); await png.dblclick();
  await expect(page.getByRole("button", { name: "Exporting image..." })).toBeDisabled(); await expect(page.getByLabel("Submitted-date period")).toBeDisabled();
  const file = await downloaded; const path = await file.path(); if (!path) throw new Error("No PNG path"); const bytes = await readFile(path);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG"); expect(bytes.length).toBeGreaterThan(10000);
  await copyFile(path, info.outputPath("finance-report.png")); await expect(page.getByRole("button", { name: "Export PNG" })).toBeEnabled();
});
test("image failures release controls and allow a real retry", async ({ page }) => {
  await page.evaluate(() => { const original = HTMLCanvasElement.prototype.toDataURL; HTMLCanvasElement.prototype.toDataURL = function () { HTMLCanvasElement.prototype.toDataURL = original; throw new Error("Synthetic canvas failure"); }; });
  await page.getByRole("button", { name: "Export PNG" }).click(); await expect(page.getByText("The visual report could not be generated. Try again.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Submitted-date period")).toBeEnabled(); const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click(); await downloaded;
});
for (const change of ["Switch administrator", "Revoke administrator role"]) test(change + " hides finance data", async ({ page }) => {
  await page.getByRole("button", { name: change, exact: true }).click(); await expect(page.getByRole("alert")).toContainText("account or role changed"); await expect(page.getByText("Known Settled Value", { exact: true })).toHaveCount(0);
});
test("API authorization failure hides the cached report", async ({ page, state }) => {
  state.status = 403; await page.getByRole("button", { name: "Refresh report" }).click(); await expect(page.getByRole("alert")).toContainText("administrator session changed"); await expect(page.getByText("Known Settled Value", { exact: true })).toHaveCount(0);
});
test("an administrator switch during image generation prevents a late download", async ({ page }) => {
  await page.route(url => url.pathname.includes("html-to-image"), async route => { await new Promise(done => setTimeout(done, 600)); return route.continue(); });
  let downloads = 0; page.on("download", () => downloads++);
  await page.getByRole("button", { name: "Export PNG" }).click(); await page.getByRole("button", { name: "Switch administrator", exact: true }).click();
  await page.waitForLoadState("networkidle"); await expect(page.getByRole("alert")).toContainText("account or role changed"); expect(downloads).toBe(0);
});
