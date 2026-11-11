import { test as base, expect, type Page } from "@playwright/test";
import { startComponentFixture } from "../navigation-fixture/server.mjs";
import { directoryTotals, type DirectoryStudent, type StudentDirectory } from "../../src/lib/student-directory-model";

function rows(): DirectoryStudent[] {
  return Array.from({ length: 24 }, (_, i) => ({ id: "student_" + i, name: "Student " + String(i + 1).padStart(2, "0"),
    email: "primary" + String(i + 1).padStart(2, "0") + "@example.invalid", imageUrl: null,
    requestCount: i % 4, collectedCentavos: i === 0 ? 0 : i === 1 ? 15050 : 10000, unverifiedCount: i === 2 ? 1 : 0 }));
}
type State = { items: DirectoryStudent[]; status: number; malformed: boolean; delay: number; unavailable: boolean; reads: number; bootstrapActor: string };
const test = base.extend<{ state: State }, { fixtureURL: string }>({
  fixtureURL: [async ({ browserName }, provide) => {
    if (browserName !== "chromium") throw new Error("Chrome required");
    const server = await startComponentFixture("student-directory-fixture");
    try { await provide(server.url); } finally { await server.close(); }
  }, { scope: "worker" }],
  state: async ({ page, fixtureURL }, provide) => {
    const state: State = { items: rows(), status: 200, malformed: false, delay: 0, unavailable: false, reads: 0, bootstrapActor: "staff_synthetic" };
    const dataset = (): StudentDirectory => ({ actorId: "staff_synthetic", role: "employee", asOf: "2026-11-12T00:00:00.000Z", items: state.items, totals: directoryTotals(state.items) });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => { if (new URL(route.request().url()).origin === fixtureURL) return route.continue(); errors.push("Unexpected outbound request"); return route.abort(); });
    await page.route("**/fixture/bootstrap", route => route.fulfill({ json: { data: state.unavailable ? undefined : { ...dataset(), actorId: state.bootstrapActor }, unavailable: state.unavailable } }));
    await page.route(url => url.pathname === "/api/admin/students", async route => {
      state.reads++; const data = dataset(); const status = state.status; const malformed = state.malformed;
      expect(new URL(route.request().url()).search).toBe("?format=directory-v1");
      if (state.delay) await new Promise(done => setTimeout(done, state.delay));
      await route.fulfill({ status, json: malformed ? { items: [] } : data });
    });
    await provide(state); expect(errors).toEqual([]);
  },
});
test.beforeEach(async ({ page, fixtureURL, state }) => { expect(state.items).toHaveLength(24); await page.goto(fixtureURL); await page.waitForLoadState("networkidle"); });
const kpi = (page: Page, label: string) => page.getByText(label, { exact: true }).locator("..");
const refresh = (page: Page) => page.getByRole("button", { name: "Refresh directory", exact: true });

test("complete totals and rows preserve exact centavos, zero and review information", async ({ page, state }) => {
  await expect(kpi(page, "Registered Students")).toContainText("24"); await expect(kpi(page, "Verified Settled Value")).toContainText("2,350.50");
  await expect(page.getByRole("row").filter({ hasText: "Student 01" })).toContainText("₱0.00");
  await expect(page.getByRole("row").filter({ hasText: "Student 02" })).toContainText("₱150.50");
  await expect(page.getByText("1 amount(s) need verification; excluded.", { exact: true })).toBeVisible(); expect(state.reads).toBe(0);
});
test("all sort headers retain keyboard focus and reset pagination", async ({ page }) => {
  for (const label of ["Student", "Primary Email", "Requests", "Verified Value"]) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const sort = page.getByRole("button", { name: label, exact: true }); await sort.focus(); await sort.press("Enter");
    await expect(sort).toBeFocused(); await expect(sort.locator("..")).not.toHaveAttribute("aria-sort", "none"); await expect(page.getByText(/Page 1 of 3/)).toBeVisible();
  }
});
test("searching across the entire snapshot resets the page and keeps totals unfiltered", async ({ page }) => {
  await page.getByRole("button", { name: "Next", exact: true }).click(); await page.getByLabel("Search students").fill(" PRIMARY24@ ");
  await expect(page.getByText(/of 1 matching students. Page 1 of 1/)).toBeVisible(); await expect(page.getByRole("row").filter({ hasText: "Student 24" })).toBeVisible();
  await expect(kpi(page, "Registered Students")).toContainText("24");
  await page.getByLabel("Search students").fill("not-present"); await expect(page.getByText("No students match your search.")).toBeVisible();
  await expect(page.getByText(/Showing 0–0 of 0/)).toBeVisible(); await page.getByLabel("Search students").clear(); await expect(page.getByText(/Showing 1–10 of 24/)).toBeVisible();
});
test("shrinking a refreshed directory clamps the page instead of showing an empty page", async ({ page, state }) => {
  await page.getByRole("button", { name: "Next", exact: true }).click(); await page.getByRole("button", { name: "Next", exact: true }).click();
  state.items = state.items.slice(0, 2); await refresh(page).click(); await expect(page.getByText(/Showing 1–2 of 2/)).toBeVisible();
  await expect(page.getByText("No students match your search.")).toHaveCount(0); await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
});
test("an empty complete directory has truthful zero totals and one empty page", async ({ page, state }) => {
  state.items = []; await refresh(page).click(); await expect(page.getByText("No students are currently registered.")).toBeVisible();
  await expect(kpi(page, "Registered Students")).toContainText("0"); await expect(kpi(page, "Verified Settled Value")).toContainText("₱0.00"); await expect(page.getByText(/Page 1 of 1/)).toBeVisible();
});
test("failed and malformed refreshes retain the last verified rows and recover", async ({ page, state }) => {
  for (const malformed of [false, true]) {
    state.status = malformed ? 200 : 500; state.malformed = malformed;
    await refresh(page).click(); await expect(page.getByRole("alert")).toContainText("last verified complete snapshot"); await expect(kpi(page, "Registered Students")).toContainText("24");
    state.status = 200; state.malformed = false; await refresh(page).click(); await expect(page.getByRole("alert")).toHaveCount(0);
  }
});
test("a slow refresh guards repeated activation and does not poll in the background", async ({ page, state }) => {
  state.delay = 800; await refresh(page).dblclick(); await expect(page.getByRole("button", { name: "Refreshing directory…" })).toBeDisabled();
  await expect(refresh(page)).toBeEnabled(); expect(state.reads).toBe(1);
  await page.clock.install(); await page.clock.fastForward(120000); await expect(page.getByText("Student 01", { exact: true })).toBeVisible(); expect(state.reads).toBe(1);
});
test("initial failures show no fabricated metrics and remain recoverable", async ({ page, state }) => {
  state.unavailable = true; state.status = 503; await page.reload(); await page.waitForLoadState("networkidle");
  await expect(page.getByRole("alert")).toContainText("No totals are available"); await expect(page.getByText("Registered Students", { exact: true })).toHaveCount(0);
  state.status = 200; await refresh(page).click(); await expect(kpi(page, "Registered Students")).toContainText("24");
});
for (const change of ["Switch staff account", "Revoke staff role"]) test(change + " removes directory PII immediately", async ({ page }) => {
  await page.getByRole("button", { name: change, exact: true }).click(); await expect(page.getByRole("alert")).toContainText("account or role changed");
  await expect(page.getByText("Student 01", { exact: true })).toHaveCount(0); await expect(page.getByText("Registered Students", { exact: true })).toHaveCount(0);
});
test("API authorization failures hide cached directory data", async ({ page, state }) => {
  state.status = 403; await refresh(page).click(); await expect(page.getByRole("alert")).toContainText("staff session changed"); await expect(page.getByText("Student 01", { exact: true })).toHaveCount(0);
});
test("Clerk's protected-route 404 hides cached data before session hooks catch up", async ({ page, state }) => {
  state.status = 404; await refresh(page).click(); await expect(page.getByRole("alert")).toContainText("access to this directory could not be verified");
  await expect(page.getByText("Student 01", { exact: true })).toHaveCount(0); await expect(page.getByText("Registered Students", { exact: true })).toHaveCount(0);
});
test("rejects another actor's initial snapshot before rendering any personal data", async ({ page, state }) => {
  state.bootstrapActor = "other_staff"; state.status = 403; state.delay = 1500;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Refreshing directory…" })).toBeVisible();
  await expect(page.getByText("Student 01", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("staff session changed");
});
test("an oversized refresh explains the capacity limit and retains its verified snapshot", async ({ page, state }) => {
  state.status = 413; await refresh(page).click(); await expect(page.getByRole("alert")).toContainText("too large to load completely");
  await expect(kpi(page, "Registered Students")).toContainText("24");
  state.status = 200; await refresh(page).click(); await expect(page.getByRole("alert")).toHaveCount(0);
});
test("a late refresh cannot reveal rows after switching staff accounts and the phone layout fits", async ({ page, state }, info) => {
  const width = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth })); expect(width.content).toBeLessThanOrEqual(width.viewport);
  await page.screenshot({ path: info.outputPath("student-directory.png"), fullPage: true });
  state.delay = 800; await refresh(page).click(); await page.getByRole("button", { name: "Switch staff account", exact: true }).click();
  await page.waitForLoadState("networkidle"); await expect(page.getByText("Student 01", { exact: true })).toHaveCount(0);
});
