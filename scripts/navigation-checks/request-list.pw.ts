import { test as base, expect } from "@playwright/test";
import { startComponentFixture } from "../navigation-fixture/server.mjs";
import { DEFAULT_HISTORY_QUERY, type HistoryQuery, type StudentHistory, type StudentRequest } from "../../src/lib/student-request-model";

const owner = "user_student123";
function rows(count = 13): StudentRequest[] {
  return Array.from({ length: count }, (_, index) => ({
    id: "c" + String(index).padStart(24, "0"), documentType: "Document " + String(index).padStart(2, "0"), purpose: "PERSONAL",
    paymentMethod: "online", paymentStatus: "UNPAID", status: "PENDING_PAYMENT", cancelReason: null,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}
type Fixture = {
  state: { history: { studentId: string; items: StudentRequest[] }; reads: string[]; delay: number; refreshStatus: number; malformed: boolean; cancels: number; cancelMode: "abort" | "reject" | "success" | "success-read-fails"; pays: number; payMode: "unsafe" | "success" };
};
// Synthetic server pages; real query semantics are covered with the real adapter
// in student-request-data.test.ts, independently of this browser adapter.
function historyPage(history: Fixture["state"]["history"], query: HistoryQuery = DEFAULT_HISTORY_QUERY): StudentHistory {
  const sorted = [...history.items].sort((a, b) => {
    const left = a[query.sort], right = b[query.sort];
    return ((left < right ? -1 : left > right ? 1 : 0) * (query.direction === "asc" ? 1 : -1)) || a.id.localeCompare(b.id);
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / 10));
  const page = Math.min(query.page, totalPages);
  return { studentId: history.studentId, items: sorted.slice((page - 1) * 10, page * 10), totalPages, query: { ...query, page }, summary: {
    total: sorted.length, active: sorted.filter(item => !["COMPLETED", "CANCELLED"].includes(item.status)).length,
    completed: sorted.filter(item => item.status === "COMPLETED").length,
  } };
}
const test = base.extend<Fixture, { fixtureURL: string }>({
  fixtureURL: [async ({ browserName }, provideFixture) => {
    if (browserName !== "chromium") throw new Error("Chrome required.");
    const server = await startComponentFixture("request-list-fixture");
    try { await provideFixture(server.url); } finally { await server.close(); }
  }, { scope: "worker" }],
  state: async ({ page, fixtureURL }, provideState) => {
    const state: Fixture["state"] = { history: { studentId: owner, items: rows() }, reads: [], delay: 0, refreshStatus: 200, malformed: false, cancels: 0, cancelMode: "abort", pays: 0, payMode: "unsafe" };
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      if (new URL(route.request().url()).origin === fixtureURL) return route.continue();
      errors.push("Unexpected outbound request"); return route.abort();
    });
    await page.route("**/fixture/bootstrap", route => route.fulfill({ json: historyPage(state.history) }));
    await page.route(url => url.origin === fixtureURL && url.pathname === "/api/student/requests" && url.searchParams.get("format") === "history-v2", async route => {
      const params = new URL(route.request().url()).searchParams;
      state.reads.push(params.toString());
      const query: HistoryQuery = { page: Number(params.get("page") ?? 1), sort: (params.get("sort") ?? "updatedAt") as HistoryQuery["sort"], direction: (params.get("direction") ?? "desc") as HistoryQuery["direction"] };
      const payload = historyPage(state.history, query);
      if (state.delay) await new Promise(done => setTimeout(done, state.delay));
      return route.fulfill({ status: state.refreshStatus, json: state.malformed ? { error: "invalid successful response" } : payload });
    });
    await page.route("**/fixture/cancel", async route => {
      state.cancels++;
      if (state.cancelMode === "abort") return route.abort();
      if (state.cancelMode === "reject") return route.fulfill({ json: { success: false, error: "Synthetic action rejection" } });
      await new Promise(done => setTimeout(done, 600));
      const { id, reason } = route.request().postDataJSON();
      const saved = { ...state.history.items.find(item => item.id === id)!, status: "CANCELLED" as const, cancelReason: reason, updatedAt: "2026-11-11T00:00:00.000Z" };
      state.history = { ...state.history, items: state.history.items.map(item => item.id === id ? saved : item) };
      if (state.cancelMode === "success-read-fails") state.refreshStatus = 500;
      return route.fulfill({ json: { success: true, request: saved, warning: "Synthetic payment reconciliation warning" } });
    });
    await page.route("**/fixture/pay", async route => {
      state.pays++;
      await new Promise(done => setTimeout(done, 600));
      return route.fulfill({ json: { success: true, redirectUrl: state.payMode === "success" ? "https://checkout.example.invalid/fixture" : "javascript:alert('invalid')" } });
    });
    await provideState(state);
    expect(errors).toEqual([]);
  },
});

test.beforeEach(async ({ page, fixtureURL, state }) => {
  expect(state.history.studentId).toBe(owner);
  await page.goto(fixtureURL);
  await expect(page.getByText("Request History", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(10);
});

test("sorting retains keyboard focus and returns to the first page", async ({ page }) => {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  const sort = page.getByRole("button", { name: "Document Type", exact: true });
  await sort.click();
  await expect(sort).toBeFocused();
  await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Document Type" })).toHaveAttribute("aria-sort", "ascending");
});

test("shrinking history clamps pagination without rendering an empty page", async ({ page, state }) => {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  state.history = { ...state.history, items: state.history.items.slice(0, 3) };
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(3);
  await expect(page.getByText("No Requests Found", { exact: true })).toHaveCount(0);
});

for (const variant of ["http-error", "malformed-json"] as const) {
  test("preserves last verified rows and recovers after " + variant, async ({ page, state }) => {
    if (variant === "http-error") state.refreshStatus = 500; else state.malformed = true;
    await page.getByRole("button", { name: "Refresh history" }).click();
    await expect(page.getByRole("alert")).toContainText("Showing the last verified data");
    await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(10);
    await page.getByRole("button", { name: "View request " + rows()[0].id, exact: true }).click();
    await expect(page.getByRole("button", { name: "Cancel Request", exact: true })).toBeDisabled();
    state.refreshStatus = 200; state.malformed = false;
    await page.getByRole("button", { name: "Refresh history" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel Request", exact: true })).toBeEnabled();
  });
}

test("transport and action failures preserve the reason; confirmation is guarded while pending", async ({ page, state }) => {
  const id = rows()[0].id;
  await page.getByRole("button", { name: "View request " + id, exact: true }).click();
  await page.getByRole("button", { name: "Cancel Request", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel Request", exact: true });
  await dialog.getByLabel("Cancellation reason").fill("Requested the wrong document");
  await dialog.getByRole("button", { name: "Confirm Cancellation" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Cancellation could not be confirmed");
  await expect(dialog.getByLabel("Cancellation reason")).toHaveValue("Requested the wrong document");
  state.cancelMode = "reject";
  await dialog.getByRole("button", { name: "Confirm Cancellation" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Synthetic action rejection");
  state.cancelMode = "success";
  await dialog.getByRole("button", { name: "Confirm Cancellation" }).dblclick();
  await expect(dialog.getByRole("button", { name: "Cancelling..." })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Back" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(state.cancels).toBe(3);
  await expect(page.getByText("Synthetic payment reconciliation warning", { exact: true })).toBeVisible();
});

test("a committed cancellation remains visible when the following refresh fails", async ({ page, state }) => {
  const id = rows()[0].id; state.cancelMode = "success-read-fails";
  await page.getByRole("button", { name: "View request " + id, exact: true }).click();
  await page.getByRole("button", { name: "Cancel Request", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cancellation reason").fill("Plans changed");
  await dialog.getByRole("button", { name: "Confirm Cancellation" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("alert")).toContainText("Showing the last verified data");
  await expect(page.getByText("Request Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByText("Active Requests", { exact: true }).locator("..").getByText("12", { exact: true })).toBeVisible();
  await expect(page.getByText("Total Requests", { exact: true }).locator("..").getByText("13", { exact: true })).toBeVisible();
  await expect(page.getByText("Cancellation could not be confirmed. Refresh the history before trying again.", { exact: true })).toHaveCount(0);
  expect(state.cancels).toBe(1);
});

test("a polled workflow change disables a stale cancellation confirmation", async ({ page, state }) => {
  await page.clock.install();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(10);
  const id = rows()[0].id;
  await page.getByRole("button", { name: "View request " + id, exact: true }).click();
  await page.getByRole("button", { name: "Cancel Request", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cancellation reason").fill("Plans changed");
  state.history.items[0] = { ...state.history.items[0], status: "PROCESSING", updatedAt: "2026-11-11T00:00:00.000Z" };
  await page.clock.fastForward(31000);
  await expect(dialog.getByRole("alert")).toContainText("can no longer be cancelled");
  await expect(dialog.getByRole("button", { name: "Confirm Cancellation" })).toBeDisabled();
  expect(state.cancels).toBe(0);
});

test("payment setup rejects unsafe destinations and recovers its pending controls", async ({ page, state }) => {
  await page.getByRole("button", { name: "View request " + rows()[0].id, exact: true }).click();
  const pay = page.getByRole("button", { name: "Pay Now", exact: true });
  await pay.dblclick();
  await expect(pay).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel Request", exact: true })).toBeDisabled();
  await expect(pay).toBeEnabled();
  expect(state.pays).toBe(1);
  await expect(page.getByText("Payment setup could not be confirmed. Wait 30 seconds, then refresh before trying again.", { exact: true })).toBeVisible();
});

test("account switching immediately hides the previous student's history", async ({ page }) => {
  await page.getByRole("button", { name: "Switch account", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your account changed");
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(0);
});

test("an expired session does not keep rendering cached personal history", async ({ page, state }) => {
  state.refreshStatus = 401;
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByRole("alert")).toContainText("Your session changed");
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(0);
});

test("a late payment setup response cannot redirect a different signed-in account", async ({ page, state, fixtureURL }) => {
  state.payMode = "success";
  await page.getByRole("button", { name: "View request " + rows()[0].id, exact: true }).click();
  const completed = page.waitForResponse("**/fixture/pay");
  await page.getByRole("button", { name: "Pay Now", exact: true }).click();
  await page.getByRole("button", { name: "Switch account", exact: true }).click();
  await completed;
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("alert")).toContainText("Your account changed");
  expect(new URL(page.url()).origin).toBe(fixtureURL);
});

test("cancellation drafts are isolated by request and the phone dialog fits its viewport", async ({ page }, testInfo) => {
  const id = rows()[0].id;
  await page.getByRole("button", { name: "View request " + id, exact: true }).click();
  await page.getByRole("button", { name: "Cancel Request", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cancellation reason").fill("Synthetic cancellation reason");
  await expect(dialog).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath("student-cancellation.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "View request " + rows()[1].id, exact: true }).click();
  await page.getByRole("button", { name: "Cancel Request", exact: true }).click();
  await expect(dialog.getByLabel("Cancellation reason")).toHaveValue("");
});

test("a refresh error during payment setup does not leave controls stuck after recovery", async ({ page, state, fixtureURL }) => {
  state.payMode = "success";
  await page.getByRole("button", { name: "View request " + rows()[0].id, exact: true }).click();
  const completed = page.waitForResponse("**/fixture/pay");
  await page.getByRole("button", { name: "Pay Now", exact: true }).click();
  state.refreshStatus = 500;
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByRole("alert")).toContainText("Showing the last verified data");
  await completed;
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).origin).toBe(fixtureURL);
  state.refreshStatus = 200;
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByRole("button", { name: "Pay Now", exact: true })).toBeEnabled();
});

test("server pages keep whole-history counts and send page and sort parameters", async ({ page, state }) => {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(3);
  await expect(page.getByText("Showing 11 to 13 of 13 requests", { exact: true })).toBeVisible();
  await expect(page.getByText("Total Requests", { exact: true }).locator("..").getByText("13", { exact: true })).toBeVisible();
  expect(state.reads.some(query => query.includes("page=2"))).toBe(true);
  await page.getByRole("button", { name: "Document Type", exact: true }).click();
  await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  expect(state.reads.some(query => query.includes("page=1&sort=documentType&direction=asc"))).toBe(true);
});

test("a slow or failed page change retains verified rows and disables stale actions until recovery", async ({ page, state }) => {
  state.delay = 600; state.refreshStatus = 500;
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Loading request history...", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View request " + rows()[0].id, exact: true }).click();
  await expect(page.getByRole("button", { name: "Pay Now", exact: true })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Showing the last verified data");
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(10);
  state.delay = 0; state.refreshStatus = 200;
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(3);
  expect(state.pays).toBe(0); expect(state.cancels).toBe(0);
});

test("a late response for an older sort cannot replace the current page", async ({ page, state }) => {
  state.delay = 700;
  const late = page.waitForResponse(response => new URL(response.url()).searchParams.get("sort") === "documentType");
  await page.getByRole("button", { name: "Document Type", exact: true }).click();
  await expect.poll(() => state.reads.some(query => query.includes("sort=documentType"))).toBe(true);
  state.delay = 10;
  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Status", exact: true })).toHaveAttribute("aria-sort", "ascending");
  await late;
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("columnheader", { name: "Status", exact: true })).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByRole("columnheader", { name: "Document Type", exact: true })).toHaveAttribute("aria-sort", "none");
});

test("active history polling waits thirty seconds instead of five", async ({ page, state }) => {
  await page.clock.install();
  await page.reload();
  await page.waitForLoadState("networkidle");
  const reads = state.reads.length;
  await page.clock.fastForward(6000);
  expect(state.reads.length).toBe(reads);
  await page.clock.fastForward(25000);
  await expect.poll(() => state.reads.length).toBeGreaterThan(reads);
});

test("settled histories stop interval polling and reconnect discovers a new request", async ({ page, state }) => {
  state.history.items = state.history.items.map(item => ({ ...item, status: "COMPLETED" }));
  await page.clock.install();
  await page.reload();
  await page.waitForLoadState("networkidle");
  const reads = state.reads.length;
  await page.clock.fastForward(65000);
  expect(state.reads.length).toBe(reads);
  await page.context().setOffline(true);
  state.history.items.push({ ...rows()[0], id: "new_synthetic_request" });
  await page.context().setOffline(false);
  await page.clock.runFor(30);
  await expect(page.getByText("Total Requests", { exact: true }).locator("..").getByText("14", { exact: true })).toBeVisible();
  const resumed = state.reads.length;
  await page.clock.fastForward(31000);
  await expect.poll(() => state.reads.length).toBeGreaterThan(resumed);
});

test("summary changes outside the visible page arrive without downloading those rows", async ({ page, state }) => {
  state.history.items = state.history.items.map((item, index) => index >= 10 ? { ...item, status: "COMPLETED" } : item);
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByText("Completed", { exact: true }).locator("..").getByText("3", { exact: true })).toBeVisible();
  await expect(page.getByText("Active Requests", { exact: true }).locator("..").getByText("10", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(10);
  await expect(page.getByRole("button", { name: "View request " + rows()[12].id, exact: true })).toHaveCount(0);
});

test("a confirmed cancellation stays cancelled in another cached sort when refresh fails", async ({ page, state }) => {
  await page.getByRole("button", { name: "Reference ID", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Reference ID", exact: true })).toHaveAttribute("aria-sort", "ascending");
  await page.getByRole("button", { name: "Document Type", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Document Type", exact: true })).toHaveAttribute("aria-sort", "ascending");
  state.cancelMode = "success-read-fails";
  await page.getByRole("button", { name: "View request " + rows()[0].id, exact: true }).click();
  await page.getByRole("button", { name: "Cancel Request", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Cancellation reason").fill("Plans changed");
  await page.getByRole("dialog").getByRole("button", { name: "Confirm Cancellation" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("alert")).toContainText("Showing the last verified data");
  await page.getByRole("button", { name: "Reference ID", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Reference ID", exact: true })).toHaveAttribute("aria-sort", "ascending");
  await page.getByRole("button", { name: "View request " + rows()[0].id, exact: true }).click();
  await expect(page.getByText("Request Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel Request", exact: true })).toHaveCount(0);
});
