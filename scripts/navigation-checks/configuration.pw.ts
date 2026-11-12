import { test as base, expect, type Page } from "@playwright/test";
import { startComponentFixture } from "../navigation-fixture/server.mjs";
import { canonicalSetting, createDocumentSchema, settingDefault, SETTING_KEYS, type ConfigDocument, type SettingEntry } from "../../src/lib/configuration-model";
import type { RolesSnapshot } from "../../src/lib/configuration-fetcher";

const version = "2026-11-12T00:00:00.000Z";
type State = { documents: ConfigDocument[]; settings: SettingEntry[]; users: RolesSnapshot["users"]; unavailable: boolean; status: number; malformed: boolean;
  actionMode: "ok" | "throw" | "conflict" | "auth"; delay: number; dropAfterCommit: boolean; calls: { kind: string; form: Record<string, string> }[]; reads: string[] };
const test = base.extend<{ state: State }, { fixtureURL: string }>({
  fixtureURL: [async ({ browserName }, provide) => { if (browserName !== "chromium") throw new Error("Chrome required"); const server = await startComponentFixture("configuration-fixture"); try { await provide(server.url); } finally { await server.close(); } }, { scope: "worker" }],
  state: async ({ page, fixtureURL }, provide) => {
    const state: State = { documents: Array.from({ length: 9 }, (_, i) => ({ id: "config_" + i, typeId: "CODE_" + i, label: "Document " + i, description: "Official synthetic record", price: i === 0 ? 0 : 15050, isActive: true, updatedAt: version })),
      settings: SETTING_KEYS.map(key => ({ key, value: settingDefault(key), valid: true, version })), users: [{ id: "admin_synthetic", name: "Current Admin", email: "admin@example.invalid", role: "admin" }, { id: "target", name: "Target Student", email: "primary@example.invalid", role: "student" }],
      unavailable: false, status: 200, malformed: false, actionMode: "ok", delay: 0, dropAfterCommit: false, calls: [], reads: [] };
    const snapshots = () => ({ documents: { actorId: "admin_synthetic", asOf: version, items: state.documents }, settings: { actorId: "admin_synthetic", asOf: version, entries: state.settings }, roles: { actorId: "admin_synthetic", asOf: version, users: state.users } });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => { if (new URL(route.request().url()).origin === fixtureURL) return route.continue(); errors.push("Unexpected outbound request"); return route.abort(); });
    await page.route("**/fixture/bootstrap", route => route.fulfill({ json: state.unavailable ? {} : snapshots() }));
    await page.route(url => url.pathname === "/api/admin/configuration", route => {
      const params = new URL(route.request().url()).searchParams; expect(params.get("format")).toBe("config-v1"); const area = params.get("area") as keyof ReturnType<typeof snapshots>; state.reads.push(area);
      return route.fulfill({ status: state.status, json: state.malformed ? {} : snapshots()[area] });
    });
    await page.route("**/fixture/action", async route => {
      const call = route.request().postDataJSON() as State["calls"][number]; state.calls.push(call);
      if (state.delay) await new Promise(done => setTimeout(done, state.delay));
      if (state.actionMode === "throw") return route.fulfill({ status: 500, json: {} });
      if (state.actionMode !== "ok") return route.fulfill({ json: { success: false, code: state.actionMode, error: state.actionMode === "conflict" ? "Configuration changed. Refresh before saving." : "Administrator access required." } });
      let data: ConfigDocument | SettingEntry | number | undefined;
      const nextVersion = new Date(Date.parse(version) + state.calls.length * 1000).toISOString();
      if (call.kind === "create") {
        const input = createDocumentSchema.parse(call.form); const id = "new_" + input.intentId; data = state.documents.find(item => item.id === id);
        if (!data) { data = { id, typeId: input.typeId, label: input.label, description: input.description, price: input.price, isActive: input.isActive, updatedAt: nextVersion }; state.documents.push(data); }
      } else if (call.kind === "document") {
        const current = state.documents.find(item => item.id === call.form.id)!;
        data = { ...current, label: call.form.label.trim(), description: call.form.description.trim(), price: Math.round(Number(call.form.price) * 100), isActive: call.form.isActive === "true", updatedAt: nextVersion };
        state.documents = state.documents.map(item => item.id === current.id ? data as ConfigDocument : item);
      } else if (call.kind === "setting") {
        const key = call.form.key as SettingEntry["key"]; data = { key, value: canonicalSetting(key, call.form.value), valid: true, version: nextVersion };
        state.settings = state.settings.map(item => item.key === key ? data as SettingEntry : item);
      } else if (call.kind === "role") state.users = state.users.map(user => user.id === call.form.id ? { ...user, role: call.form.role as "employee" } : user);
      else data = 4;
      if (state.dropAfterCommit) { state.dropAfterCommit = false; return route.fulfill({ status: 500, json: {} }); }
      return route.fulfill({ json: { success: true, data } });
    });
    await provide(state); expect(errors).toEqual([]);
  },
});
test.beforeEach(async ({ page, fixtureURL, state }) => { expect(state.documents).toHaveLength(9); await page.goto(fixtureURL); await page.waitForLoadState("networkidle"); });
async function settings(page: Page, fixtureURL: string) { await page.goto(fixtureURL + "?screen=settings"); await page.waitForLoadState("networkidle"); }
async function create(page: Page, label = "New Document") { await page.getByRole("button", { name: "Add document", exact: true }).click(); await page.getByLabel("Document name").fill(label); await page.getByLabel("Description", { exact: true }).fill("Official new document"); await page.getByLabel("Price (PHP)").fill("150.50"); }

test("document rows preserve zero and centavos; search resets pages and refresh clamps them", async ({ page, state }) => {
  await expect(page.getByRole("row").filter({ hasText: "Document 0" })).toContainText("₱0.00"); await expect(page.getByRole("row").filter({ hasText: "Document 1" })).toContainText("₱150.50");
  await page.getByRole("button", { name: "Next", exact: true }).click(); await page.getByLabel("Search documents").fill("Document 8"); await expect(page.getByText("Page 1 of 1; 1 matching documents.")).toBeVisible();
  await page.getByLabel("Search documents").clear(); await page.getByRole("button", { name: "Next", exact: true }).click(); state.documents = state.documents.slice(0, 2); await page.getByRole("button", { name: "Refresh documents" }).click(); await expect(page.getByText("Page 1 of 1; 2 matching documents.")).toBeVisible();
});
test("editing uses the confirmed exact price and immutable code", async ({ page, state }) => {
  await page.getByRole("button", { name: "Edit Document 1", exact: true }).click(); await expect(page.getByLabel("Document code (fixed)")).toBeDisabled(); await page.getByLabel("Price (PHP)").fill("175.25");
  await page.getByRole("button", { name: "Save document", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "Document 1" })).toContainText("₱175.25"); expect(state.calls[0].form.expectedVersion).toBe(version);
});
test("new document failures preserve drafts and retry the exact same create intent", async ({ page, state }) => {
  await create(page); state.dropAfterCommit = true; await page.getByRole("button", { name: "Save document", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry same save" })).toBeEnabled(); await expect(page.getByLabel("Document name")).toHaveValue("New Document"); await expect(page.getByLabel("Document name")).toBeDisabled();
  await page.getByRole("button", { name: "Retry same save" }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.calls[0].form).toEqual(state.calls[1].form); expect(state.documents.filter(item => item.label === "New Document")).toHaveLength(1);
});
test("guarded saves resist double activation and preserve drafts on rejection", async ({ page, state }) => {
  await create(page); state.delay = 800; state.actionMode = "conflict";
  await page.getByRole("button", { name: "Save document", exact: true }).dblclick(); await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled(); await expect(page.getByLabel("Document name")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save document", exact: true })).toBeEnabled(); expect(state.calls).toHaveLength(1); await expect(page.getByLabel("Document name")).toHaveValue("New Document"); await expect(page.getByRole("alert")).toContainText("changed");
});
test("invalid prices are rejected locally and standard defaults require explicit confirmation", async ({ page, state }) => {
  await create(page); await page.getByLabel("Price (PHP)").fill("1.005"); await page.getByRole("button", { name: "Save document", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("decimal"); expect(state.calls).toHaveLength(0);
  await page.getByRole("button", { name: "Close", exact: true }).first().click(); await page.getByRole("button", { name: "Add standard documents" }).click(); expect(state.calls).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm standard documents" }).click(); await expect(page.getByText(/4 standard document/)).toBeVisible(); expect(state.calls[0].kind).toBe("defaults");
});
test("an initial catalog failure has recovery and no fake empty-catalog success", async ({ page, state }) => {
  state.unavailable = true; state.status = 503; await page.reload(); await page.waitForLoadState("networkidle"); await expect(page.getByRole("alert")).toContainText("could not be refreshed"); await expect(page.getByRole("button", { name: "Add document", exact: true })).toBeDisabled();
  state.status = 200; await page.getByRole("button", { name: "Refresh documents" }).click(); await expect(page.getByRole("button", { name: "Add document", exact: true })).toBeEnabled();
});
test("a failed catalog refresh retains verified rows and blocks editing", async ({ page, state }) => {
  for (const malformed of [false, true]) { state.status = malformed ? 200 : 500; state.malformed = malformed; await page.getByRole("button", { name: "Refresh documents" }).click(); await expect(page.getByRole("alert")).toBeVisible(); await expect(page.getByText("Document 1", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Edit Document 1", exact: true })).toBeDisabled(); state.status = 200; state.malformed = false; await page.getByRole("button", { name: "Refresh documents" }).click(); await expect(page.getByRole("alert")).toHaveCount(0); }
});
test("a fresh snapshot marks an older document edit stale without replacing its draft", async ({ page, state }) => {
  await page.getByRole("button", { name: "Edit Document 1", exact: true }).click(); await page.getByLabel("Price (PHP)").fill("175.25");
  state.documents = state.documents.map(item => item.id === "config_1" ? { ...item, price: 20050, updatedAt: "2026-11-12T00:00:01.000Z" } : item);
  await page.clock.install(); await page.clock.fastForward(61000); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert")).toContainText("document changed"); await expect(page.getByRole("button", { name: "Save document", exact: true })).toBeDisabled(); await expect(page.getByLabel("Price (PHP)")).toHaveValue("175.25"); expect(state.calls).toHaveLength(0);
});
test("payment settings use confirmed state, reject no active methods, and discard cancelled drafts", async ({ page, fixtureURL, state }) => {
  await settings(page, fixtureURL); await page.getByRole("button", { name: "Edit payment methods" }).click(); await page.getByLabel("Online payment", { exact: true }).uncheck(); await page.getByLabel("Cash on pickup", { exact: true }).uncheck(); await page.getByRole("button", { name: "Save setting", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("at least one"); expect(state.calls).toHaveLength(0);
  await page.getByRole("button", { name: "Close", exact: true }).first().click(); await page.getByRole("button", { name: "Edit payment methods" }).click(); await expect(page.getByLabel("Online payment", { exact: true })).toBeChecked();
  await page.getByLabel("Online payment", { exact: true }).uncheck(); await page.getByRole("button", { name: "Save setting", exact: true }).click(); await expect(page.getByText("Payment methods saved.", { exact: true })).toBeVisible(); expect(state.calls[0].form.value).toBe('{"online":false,"cash":true}');
});
test("settings transport failures keep the frozen draft and same version for retry", async ({ page, fixtureURL, state }) => {
  await settings(page, fixtureURL); await page.getByRole("button", { name: "Edit pickup details" }).click(); await page.getByLabel("Pickup location", { exact: true }).fill("Window 8"); state.actionMode = "throw"; await page.getByRole("button", { name: "Save setting", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry same save" })).toBeEnabled(); await expect(page.getByLabel("Pickup location", { exact: true })).toHaveValue("Window 8"); await expect(page.getByLabel("Pickup location", { exact: true })).toBeDisabled();
  state.actionMode = "ok"; await page.getByRole("button", { name: "Retry same save" }).click(); await expect(page.getByRole("dialog")).toHaveCount(0); expect(state.calls[0].form).toEqual(state.calls[1].form);
});
test("a changed setting disables an older draft until it is explicitly reopened", async ({ page, fixtureURL, state }) => {
  await settings(page, fixtureURL); await page.getByRole("button", { name: "Edit pickup details" }).click(); await page.getByLabel("Pickup location", { exact: true }).fill("Window 8");
  state.settings = state.settings.map(entry => entry.key === "OPERATIONS_CONFIG" ? { ...entry, version: "2026-11-12T00:00:01.000Z" } : entry);
  await page.clock.install(); await page.clock.fastForward(61000); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert")).toContainText("setting changed"); await expect(page.getByRole("button", { name: "Save setting", exact: true })).toBeDisabled(); await expect(page.getByLabel("Pickup location", { exact: true })).toHaveValue("Window 8");
});
test("cancelled email messages are editable and blank overrides restore the real default", async ({ page, fixtureURL, state }) => {
  await settings(page, fixtureURL); await page.getByRole("button", { name: "Edit email messages" }).click(); await page.getByLabel("Request status", { exact: true }).selectOption("CANCELLED"); await page.getByLabel("Custom email text", { exact: true }).fill("Contact the registrar for review"); await page.getByRole("button", { name: "Save setting", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.calls[0].form.value).toContain("CANCELLED"); await page.getByRole("button", { name: "Edit email messages" }).click(); await page.getByLabel("Request status", { exact: true }).selectOption("CANCELLED"); await page.getByLabel("Custom email text", { exact: true }).clear(); await page.getByRole("button", { name: "Save setting", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0); expect(state.calls[1].form.value).toBe("{}");
});
test("a malformed stored setting shows a repair state without a render crash", async ({ page, fixtureURL, state }) => {
  state.settings = state.settings.map(entry => entry.key === "OPERATIONS_CONFIG" ? { ...entry, value: "malformed", valid: false } : entry); await settings(page, fixtureURL); await expect(page.getByText("Invalid stored setting — repair required")).toBeVisible(); await page.getByRole("button", { name: "Edit pickup details" }).click(); await expect(page.getByRole("alert")).toContainText("explicit repair");
});
test("roles require confirmation, never optimistically change, and preserve uncertain outcomes for review", async ({ page, fixtureURL, state }) => {
  await settings(page, fixtureURL); await expect(page.getByLabel("Role for Current Admin")).toBeDisabled(); await page.getByLabel("Role for Target Student").selectOption("employee"); await page.getByRole("button", { name: "Save role", exact: true }).last().click();
  expect(state.calls).toHaveLength(0); state.delay = 600; state.actionMode = "throw"; await page.getByRole("button", { name: "Confirm role", exact: true }).click(); await expect(page.getByRole("dialog").getByRole("alert")).toContainText("unconfirmed"); expect(state.users[1].role).toBe("student"); await expect(page.getByRole("button", { name: "Confirm role", exact: true })).toBeDisabled();
});
for (const change of ["Switch administrator", "Revoke administrator role"]) test(change + " hides settings and role information", async ({ page, fixtureURL }) => {
  await settings(page, fixtureURL); await page.getByRole("button", { name: change, exact: true }).click(); await expect(page.getByRole("alert")).toContainText("account or role changed"); await expect(page.getByText("Target Student", { exact: true })).toHaveCount(0); await expect(page.getByText("System controls", { exact: true })).toHaveCount(0);
});
test("protected-route 404 clears all settings panels before session hooks change", async ({ page, fixtureURL, state }) => {
  await settings(page, fixtureURL); state.status = 404; await page.getByRole("button", { name: "Refresh settings" }).click(); await expect(page.getByRole("alert")).toContainText("access could not be verified"); await expect(page.getByText("Target Student", { exact: true })).toHaveCount(0);
});
test("a late document save cannot affect a different account and the phone editor fits", async ({ page, state }, info) => {
  await create(page); const dialog = await page.getByRole("dialog").boundingBox(); if (!dialog) throw new Error("Dialog missing"); expect(dialog.x).toBeGreaterThanOrEqual(0); expect(dialog.x + dialog.width).toBeLessThanOrEqual(391); await page.screenshot({ path: info.outputPath("document-editor.png") });
  state.delay = 800; await page.getByRole("button", { name: "Save document", exact: true }).click(); await page.evaluate(() => window.dispatchEvent(new Event("synthetic-account-switch"))); await page.waitForLoadState("networkidle"); await expect(page.getByRole("alert")).toContainText("account or role changed"); await expect(page.getByText("Document saved.", { exact: false })).toHaveCount(0);
});
