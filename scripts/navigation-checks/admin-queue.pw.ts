import { test as base, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startComponentFixture } from "../navigation-fixture/server.mjs";
import { fixtureQueue, type QueueSource } from "../admin-queue-fixture/model";
import { queueCSV, queueQuerySchema } from "../../src/lib/admin-queue-model";
import type { QueueItem } from "../../src/lib/admin-queue-model";

function rows(): QueueItem[] {
  return Array.from({ length: 13 }, (_, i) => ({ id: "c" + String(i).padStart(24, "0"), studentName: "Student " + String(i).padStart(2, "0"), studentNumber: "22-12345-123", studentEmail: "synthetic" + i + "@example.invalid",
    documentType: "Document " + i, purpose: "PERSONAL", paymentMethod: i === 1 ? "cash" : "online", paymentStatus: i === 1 ? "CASH_ON_PICKUP" : "PAID",
    status: i === 1 ? "READY_FOR_PICKUP" : i === 2 ? "COMPLETED" : i === 3 ? "CANCELLED" : "PENDING_PAYMENT", cancelReason: i === 3 ? "Synthetic original reason" : null,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }));
}
type Submission = { requestIds: string[]; expectedVersions: string; newStatus: QueueItem["status"]; cancelReason: string | null; isOverride: string; overrideReason: string | null; confirmCashCollected: string; sendCorrectionEmail: string };
type State = { queue: QueueSource; readDelay: number; readURLs: string[]; exportStatus: number; exportDelay: number; exportURLs: string[]; status: number; malformed: boolean; mode: "success" | "reject" | "abort" | "success-read-fails"; actionDelay: number; submissions: Submission[]; reviews: number; reviewFails: boolean; reads: number };
const test = base.extend<{ state: State }, { fixtureURL: string }>({
  fixtureURL: [async ({ browserName }, provide) => {
    if (browserName !== "chromium") throw new Error("Chrome required.");
    const server = await startComponentFixture("admin-queue-fixture");
    try { await provide(server.url); } finally { await server.close(); }
  }, { scope: "worker" }],
  state: async ({ page, fixtureURL }, provide) => {
    const state: State = { readDelay: 0, readURLs: [], exportStatus: 200, exportDelay: 0, exportURLs: [], queue: { actorId: "staff_synthetic", role: "admin", emailLookupFailed: false, items: rows() }, status: 200, malformed: false, mode: "success", actionDelay: 600, submissions: [], reviews: 0, reviewFails: false, reads: 0 };
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => { if (new URL(route.request().url()).origin === fixtureURL) return route.continue(); errors.push("Unexpected outbound request"); return route.abort(); });
    await page.route("**/fixture/bootstrap", route => route.fulfill({ json: fixtureQueue(state.queue) }));
    await page.route(url => url.pathname === "/api/admin/requests", async route => {
      state.reads++; state.readURLs.push(route.request().url()); const params = new URL(route.request().url()).searchParams;
      const query = queueQuerySchema.parse({ page: Number(params.get("page") ?? 1), status: params.get("status") ?? undefined, search: params.get("search") ?? undefined, sort: params.get("sort") ?? undefined, direction: params.get("direction") ?? undefined });
      const body = fixtureQueue(state.queue, query); if (state.readDelay) await new Promise(done => setTimeout(done, state.readDelay));
      return route.fulfill({ status: state.status, json: state.malformed ? { error: "bad successful body" } : body });
    });
    await page.route(url => url.pathname === "/api/admin/requests/export", async route => {
      state.exportURLs.push(route.request().url()); if (state.exportDelay) await new Promise(done => setTimeout(done, state.exportDelay));
      if (state.exportStatus !== 200) return route.fulfill({ status: state.exportStatus, json: { error: "Synthetic export unavailable" } });
      return route.fulfill({ body: "\uFEFF" + queueCSV(state.queue.items), headers: { "Content-Type": "text/csv; charset=utf-8", "X-Queue-Actor": state.queue.actorId, "X-Queue-Role": state.queue.role, "X-Queue-Email-Lookup-Failed": "0" } });
    });
    await page.route("**/fixture/update", async route => {
      const body: Submission = route.request().postDataJSON(); state.submissions.push(body);
      if (state.mode === "abort") return route.abort();
      if (state.mode === "reject") return route.fulfill({ json: { success: false, error: "Synthetic version conflict" } });
      await new Promise(done => setTimeout(done, state.actionDelay));
      const changes = state.queue.items.filter(item => body.requestIds.includes(item.id)).map(item => ({ id: item.id, status: body.newStatus, paymentStatus: item.paymentStatus,
        cancelReason: body.newStatus === "CANCELLED" ? body.cancelReason : null, updatedAt: "2026-11-11T00:00:00.000Z" }));
      state.queue = { ...state.queue, items: state.queue.items.map(item => ({ ...item, ...changes.find(change => change.id === item.id) })) };
      if (state.mode === "success-read-fails") state.status = 500;
      return route.fulfill({ json: { success: true, changes, warning: body.newStatus === "CANCELLED" ? "Synthetic payment review warning" : undefined } });
    });
    await page.route("**/fixture/review", async route => { state.reviews++; await new Promise(done => setTimeout(done, 600));
      return route.fulfill({ json: state.reviewFails ? { success: false, error: "Synthetic review failure" } : { success: true, resolved: false, message: "Synthetic reconciliation review required" } }); });
    await provide(state); expect(errors).toEqual([]);
  },
});
test.beforeEach(async ({ page, fixtureURL, state }) => { expect(state.queue.actorId).toBe("staff_synthetic"); await page.goto(fixtureURL); await page.waitForLoadState("networkidle"); await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(10); });

test("sort focus, page clamping, and filter changes keep selection confined to the visible page", async ({ page, state }) => {
  await page.getByRole("checkbox", { name: "Select this page", exact: true }).check();
  await expect(page.getByText("10 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Selected request actions" })).toHaveCount(0);
  const header = page.getByRole("button", { name: "Student", exact: true }); await header.click();
  await expect(header).toBeFocused(); await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  state.queue.items = state.queue.items.slice(0, 3);
  await page.getByRole("button", { name: "Refresh queue", exact: true }).click();
  await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(3);
  await page.getByRole("checkbox", { name: "Select this page", exact: true }).check();
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.getByRole("group", { name: "Selected request actions" })).toHaveCount(0);
});

test("a failed or malformed refresh preserves rows, disables changes, and recovers", async ({ page, state }) => {
  for (const malformed of [false, true]) {
    state.status = malformed ? 200 : 500; state.malformed = malformed;
    await page.getByRole("button", { name: "Refresh queue", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("last verified data");
    await expect(page.getByRole("checkbox", { name: "Select this page", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(10);
    state.status = 200; state.malformed = false;
    await page.getByRole("button", { name: "Refresh queue", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
});

test("bulk updates guard double activation and release pending controls after a thrown action", async ({ page, state }) => {
  await page.getByRole("checkbox", { name: "Select request " + rows()[0].id, exact: true }).check();
  state.mode = "abort";
  await page.getByRole("button", { name: "Process", exact: true }).click();
  await expect(page.getByText("The update could not be confirmed. Refresh the queue before retrying.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Refresh queue", exact: true }).click();
  state.mode = "success";
  const process = page.getByRole("button", { name: "Process", exact: true });
  await expect(process).toBeEnabled(); await process.dblclick();
  await expect(process).toBeDisabled();
  await expect(page.getByRole("group", { name: "Selected request actions" })).toHaveCount(0);
  expect(state.submissions).toHaveLength(2);
  expect(JSON.parse(state.submissions[1].expectedVersions)).toEqual([{ id: rows()[0].id, updatedAt: rows()[0].updatedAt }]);
});

test("cancellation failure preserves its draft and a committed result survives refresh failure", async ({ page, state }) => {
  await page.getByRole("checkbox", { name: "Select request " + rows()[0].id, exact: true }).check();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel Requests" });
  await dialog.getByLabel("Cancellation reason").fill("Plans changed"); state.mode = "reject";
  await dialog.getByRole("button", { name: "Confirm Cancellation" }).click();
  await expect(dialog.getByText("Synthetic version conflict", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Cancellation reason")).toHaveValue("Plans changed");
  state.mode = "success-read-fails";
  await dialog.getByRole("button", { name: "Confirm Cancellation" }).dblclick();
  await expect(dialog.getByRole("button", { name: "Saving..." })).toBeDisabled(); await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  await expect(dialog).toBeHidden(); await expect(page.getByRole("alert")).toContainText("last verified data");
  await expect(page.getByRole("row").filter({ has: page.getByRole("button", { name: "View request " + rows()[0].id, exact: true }) }).getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic payment review warning", { exact: true })).toBeVisible();
  expect(state.submissions).toHaveLength(2);
});

test("cash completion requires explicit confirmation and submits frozen versions", async ({ page, state }) => {
  await page.getByRole("checkbox", { name: "Select request " + rows()[1].id, exact: true }).check();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  expect(state.submissions).toHaveLength(0);
  const dialog = page.getByRole("dialog", { name: "Confirm Cash Collection" });
  await dialog.getByRole("button", { name: "Cash Collected — Complete" }).click();
  await expect(dialog).toBeHidden(); expect(state.submissions[0].confirmCashCollected).toBe("true");
  expect(JSON.parse(state.submissions[0].expectedVersions)).toEqual([{ id: rows()[1].id, updatedAt: rows()[1].updatedAt }]);
});

test("a polled change disables old selections and an open edit snapshot", async ({ page, state }) => {
  await page.clock.install(); await page.reload(); await page.waitForLoadState("networkidle");
  await page.getByRole("checkbox", { name: "Select request " + rows()[0].id, exact: true }).check();
  await page.getByRole("button", { name: "View request " + rows()[0].id, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Request Details" });
  await dialog.getByLabel("Update Status").selectOption("PROCESSING");
  state.queue.items[0] = { ...state.queue.items[0], status: "PROCESSING", updatedAt: "2026-11-11T00:00:00.000Z" };
  await page.clock.fastForward(31000);
  await expect(dialog.getByText("These requests changed. Close and reopen the dialog after refreshing the queue.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Mark Ready", exact: true })).toBeDisabled();
  await expect(page.getByText("Selected requests changed or left this page. Clear and select them again.")).toBeVisible();
  expect(state.submissions).toHaveLength(0);
});

test("admin reversal needs a reason and preserves explicit correction opt-in", async ({ page, state }) => {
  await page.getByRole("button", { name: "View request " + rows()[2].id, exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByLabel("Update Status").selectOption("PROCESSING");
  await expect(dialog.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  await dialog.getByLabel("Administrator override reason").fill("Correcting a registrar error");
  await dialog.getByLabel("Send correction email for this reversal").check();
  await dialog.getByRole("button", { name: "Save Changes" }).click();
  await expect(dialog).toBeHidden();
  expect(state.submissions[0]).toMatchObject({ isOverride: "true", overrideReason: "Correcting a registrar error", sendCorrectionEmail: "true", newStatus: "PROCESSING" });
});

test("employee controls disallow reversal and payment review", async ({ page, state }) => {
  state.queue.role = "employee"; await page.reload(); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "View request " + rows()[2].id, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('option[value="PROCESSING"]')).toBeDisabled();
  await expect(dialog.getByLabel("Administrator override reason")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "View request " + rows()[3].id, exact: true }).click();
  await expect(page.getByRole("button", { name: "Reconcile payment" })).toHaveCount(0);
});

test("payment review remains guarded while pending and retryable on failure", async ({ page, state }) => {
  await page.getByRole("button", { name: "View request " + rows()[3].id, exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByLabel("Reason for review").fill("Checking payment with registrar");
  state.reviewFails = true; await dialog.getByRole("button", { name: "Reconcile payment" }).dblclick();
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  await expect(page.getByText("Synthetic review failure", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Reason for review")).toHaveValue("Checking payment with registrar");
  state.reviewFails = false; await dialog.getByRole("button", { name: "Reconcile payment" }).click();
  await expect(dialog).toBeHidden(); expect(state.reviews).toBe(2);
  await expect(page.getByText("Synthetic reconciliation review required", { exact: true })).toBeVisible();
});

for (const change of ["Switch staff account", "Revoke staff role"]) test(change + " hides the queue", async ({ page }) => {
  await page.getByRole("button", { name: change, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("staff account or role changed");
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(0);
});

test("authorization failure hides the cached queue", async ({ page, state }) => {
  state.status = 403; await page.getByRole("button", { name: "Refresh queue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("staff session changed");
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(0);
});

test("a late status result cannot affect the UI after switching staff accounts", async ({ page }) => {
  await page.getByRole("checkbox", { name: "Select request " + rows()[0].id, exact: true }).check();
  const completed = page.waitForResponse("**/fixture/update");
  await page.getByRole("button", { name: "Process", exact: true }).click();
  await page.getByRole("button", { name: "Switch staff account", exact: true }).click();
  await completed; await page.waitForLoadState("networkidle");
  await expect(page.getByRole("alert")).toContainText("staff account or role changed");
  await expect(page.getByText("Updated 1 request(s) to PROCESSING.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Your staff session changed. Reload the queue.", { exact: true })).toHaveCount(0);
});

test("authorization failure during a pending update recovers without stuck controls", async ({ page, state }) => {
  await page.clock.install(); await page.reload(); await page.waitForLoadState("networkidle");
  state.actionDelay = 2000;
  await page.getByRole("checkbox", { name: "Select request " + rows()[0].id, exact: true }).check();
  const completed = page.waitForResponse("**/fixture/update");
  await page.getByRole("button", { name: "Process", exact: true }).click();
  state.status = 403; await page.clock.fastForward(31000);
  await expect(page.getByRole("alert")).toContainText("staff session changed");
  await completed; await page.waitForLoadState("networkidle");
  state.status = 200;
  await page.context().setOffline(true); await page.context().setOffline(false); await page.clock.runFor(30);
  await expect(page.getByRole("button", { name: "Refresh queue", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select request " + rows()[0].id, exact: true }).check();
  await expect(page.getByRole("button", { name: "Mark Ready", exact: true })).toBeEnabled();
  expect(state.submissions).toHaveLength(1);
});

test("export downloads the full verified queue with escaped data", async ({ page, state }) => {
  state.queue.items[0] = { ...state.queue.items[0], studentName: 'Last, "First"', documentType: "=1+1" };
  await page.getByRole("button", { name: "Refresh queue", exact: true }).click();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export all CSV", exact: true }).click();
  const file = await download; const path = await file.path(); if (!path) throw new Error("Missing CSV file");
  const csv = await readFile(path, "utf8"); expect(csv).toContain('"Last, ""First"""'); expect(csv).toContain('"\'=1+1"');
  expect(csv).toContain(rows()[12].id); expect(csv).not.toContain("undefined");
});

test("phone details dialog fits the viewport and exposes labelled controls", async ({ page }, info) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("admin-queue-page.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "View request " + rows()[0].id, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Request Details" });
  await expect(dialog).toBeInViewport({ ratio: 1 }); await expect(dialog.getByLabel("Update Status")).toBeVisible();
  await page.screenshot({ path: info.outputPath("admin-queue-details.png"), animations: "disabled" });
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
});

test("large queues keep whole-queue counts while reading only the requested server page", async ({ page, state }) => {
  state.queue.items = Array.from({ length: 1007 }, (_, i) => ({ ...rows()[0], id: "c" + String(i).padStart(24, "0"), studentName: "Student " + String(i).padStart(4, "0") }));
  await page.getByRole("button", { name: "Refresh queue", exact: true }).click();
  await expect(page.getByText("Page 1 of 101", { exact: true })).toBeVisible();
  await expect(page.getByText("1007", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 101", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(10);
  expect(new URL(state.readURLs.at(-1)!).searchParams.get("page")).toBe("2");
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.getByText("No requests match this view.", { exact: true })).toBeVisible();
  await expect(page.getByText("1007", { exact: true })).toBeVisible();
});

test("pending and failed page changes preserve read-only rows and clear selection", async ({ page, state }) => {
  await page.getByRole("checkbox", { name: "Select this page", exact: true }).check();
  state.readDelay = 700; state.status = 503;
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Loading the requested view. Previous verified rows remain read-only.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select this page", exact: true })).toBeDisabled();
  await expect(page.getByRole("group", { name: "Selected request actions" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("last verified data");
  state.readDelay = 0; state.status = 200;
  await page.getByRole("button", { name: "Refresh queue", exact: true }).click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(3);
});

test("a late search response cannot replace the latest requested view", async ({ page, state }) => {
  state.readDelay = 900;
  await page.getByRole("textbox", { name: "Search requests" }).fill("Student 00");
  await expect.poll(() => state.readURLs.some(url => new URL(url).searchParams.get("search") === "Student 00")).toBe(true);
  state.readDelay = 0;
  await page.getByRole("textbox", { name: "Search requests" }).fill("Student 12");
  await expect(page.getByRole("button", { name: "View request " + rows()[12].id, exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(1);
  await expect(page.getByText("Student 00", { exact: true })).toHaveCount(0);
});

test("oversized exports recover with independent dates and prevent duplicate downloads", async ({ page, state }) => {
  state.exportStatus = 413;
  await page.getByRole("button", { name: "Export all CSV", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("shorter creation-date range");
  await page.getByLabel("CSV creation start date").fill("2026-01-01");
  await page.getByLabel("CSV creation end date").fill("2026-01-31");
  state.exportStatus = 200; state.exportDelay = 700;
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all CSV", exact: true }).dblclick();
  await expect(page.getByRole("button", { name: "Exporting...", exact: true })).toBeDisabled();
  await expect(page.getByLabel("CSV creation start date")).toBeDisabled();
  await downloaded;
  expect(state.exportURLs).toHaveLength(2);
  const params = new URL(state.exportURLs[1]).searchParams;
  expect(params.get("from")).toBe("2026-01-01"); expect(params.get("to")).toBe("2026-01-31"); expect(params.has("page")).toBe(false);
  await expect(page.getByRole("button", { name: "Export all CSV", exact: true })).toBeEnabled();
});

test("authorization failure during export hides cached staff data", async ({ page, state }) => {
  state.exportStatus = 404;
  await page.getByRole("button", { name: "Export all CSV", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("staff session changed");
  await expect(page.getByRole("button", { name: /^View request / })).toHaveCount(0);
});

test("switching accounts aborts a pending export without a late download", async ({ page, state }) => {
  let downloads = 0; page.on("download", () => downloads++); state.exportDelay = 700;
  await page.getByRole("button", { name: "Export all CSV", exact: true }).click();
  await expect.poll(() => state.exportURLs.length).toBe(1);
  await page.getByRole("button", { name: "Switch staff account", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("alert")).toContainText("staff account or role changed"); expect(downloads).toBe(0);
});

test("settled queues stop interval reads while manual refresh remains available", async ({ page, state }) => {
  state.queue.items = state.queue.items.map(item => ({ ...item, status: "COMPLETED" }));
  await page.clock.install(); await page.reload(); await page.waitForLoadState("networkidle");
  const reads = state.reads; await page.clock.fastForward(91_000); expect(state.reads).toBe(reads);
  await page.getByRole("button", { name: "Refresh queue", exact: true }).click();
  await expect.poll(() => state.reads).toBe(reads + 1);
});
