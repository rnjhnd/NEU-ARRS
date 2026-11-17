import { test as base, expect } from "@playwright/test";
import { startNextTransitionFixture } from "../next-transition-fixture/server.mjs";

const test = base.extend<object, { nextURL: string }>({
  nextURL: [async ({ browserName }, provide) => {
    if (browserName !== "chromium") throw Error("Chrome required");
    const fixture = await startNextTransitionFixture();
    try { await provide(fixture.url); } finally { await fixture.close(); }
  }, { scope: "worker", timeout: 90_000 }],
});

test.beforeEach(async ({ page, nextURL }) => {
  await page.route("**/*", route => new URL(route.request().url()).origin === nextURL ? route.continue() : route.abort());
  // Retain only these marker names across same-origin document handoffs, so a
  // transient interstitial cannot disappear before the final assertion.
  await page.addInitScript(() => {
    const markers = ["Opening your workspace", "Loading page", "Checking account access"];
    const sample = () => {
      const seen: string[] = JSON.parse(sessionStorage.getItem("transition-markers") ?? "[]");
      const text = document.body?.innerText ?? "";
      for (const marker of markers) if (text.includes(marker) && !seen.includes(marker)) seen.push(marker);
      sessionStorage.setItem("transition-markers", JSON.stringify(seen));
    };
    new MutationObserver(sample).observe(document, { childList: true, subtree: true, characterData: true });
    document.addEventListener("DOMContentLoaded", sample);
  });
});

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("transition-markers") ?? "[]"))).toEqual([]);
});

test("student navigation shows the destination shell before authorization and keeps one matching data skeleton", async ({ page, context, nextURL }, info) => {
  await context.addCookies([{ name: "synthetic_transition_actor", value: "student", url: nextURL }]);
  let sessionReads = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/session") sessionReads++; });
  await page.goto(nextURL + "/dashboard");
  await expect(page.getByTestId("records")).toHaveText("Overview records loaded");
  await expect.poll(() => sessionReads).toBeGreaterThan(0);
  const reads = sessionReads;
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await page.getByRole("link", { name: "New request", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Request Document", exact: true })).toBeVisible({ timeout: 700 });
  await expect(page.getByTestId("records")).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Loading request form" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
  await expect(page.getByText("Opening your workspace", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Checking account access" })).toHaveCount(0);
  const banner = await page.getByRole("heading", { name: "Request Document", exact: true }).boundingBox();
  await page.screenshot({ path: info.outputPath("next-destination-shell.png") });
  await expect(page.getByTestId("records")).toHaveText("New request records loaded");
  expect(await page.getByRole("heading", { name: "Request Document", exact: true }).boundingBox()).toEqual(banner);
  await expect(page.locator("[data-loading-region]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
  expect(sessionReads).toBe(reads);
});

const staffRoutes = [
  ["/admin/students", "Student Directory", "students"],
  ["/admin/documents", "Document Management", "documents"],
  ["/admin/settings", "System Settings", "settings"],
  ["/admin/finance", "Financial Analytics", "finance"],
  ["/admin/finance/movements", "Money Movements", "finance/movements"],
  ["/admin/notifications", "Notification recovery", "notifications"],
];
for (const [path, title, record] of staffRoutes) test(`staff destination ${title} streams its own static shell without replacing the sidebar`, async ({ page, context, nextURL }, info) => {
  await context.addCookies([{ name: "synthetic_transition_actor", value: "admin", url: nextURL }]);
  let sessionReads = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/session") sessionReads++; });
  await page.goto(nextURL + "/admin");
  await expect(page.getByTestId("records")).toHaveText("Command center records loaded");
  await expect.poll(() => sessionReads).toBeGreaterThan(0);
  const reads = sessionReads;
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  if (path.endsWith("movements") || path.endsWith("notifications")) {
    // These links are in the destination's parent page, as in the real app.
    await page.getByRole("link", { name: path.endsWith("movements") ? "Financial Analytics" : "System Settings", exact: true }).click();
    await expect(page.getByTestId("records")).toHaveText(path.endsWith("movements") ? "finance records loaded" : "settings records loaded");
  }
  await page.locator(`a[href="${path}"]`).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible({ timeout: 700 });
  await expect(page.getByTestId("records")).toHaveCount(0);
  await expect(page.locator("[data-loading-region]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
  const banner = await page.getByRole("heading", { name: title, exact: true }).boundingBox();
  if (path === "/admin/students") await page.screenshot({ path: info.outputPath("staff-destination-shell.png") });
  await expect(page.getByTestId("records")).toHaveText(record + " records loaded");
  expect(await page.getByRole("heading", { name: title, exact: true }).boundingBox()).toEqual(banner);
  await expect(page.locator("[data-loading-region]")).toHaveCount(0);
  expect(sessionReads).toBe(reads);
});

test("an employee can see only public report-shell labels while a forbidden destination is verified", async ({ page, context, nextURL }) => {
  await context.addCookies([{ name: "synthetic_transition_actor", value: "employee", url: nextURL }]);
  await page.goto(nextURL + "/admin/finance");
  await expect(page.getByRole("alert").filter({ hasText: "Access denied" })).toBeVisible();
  await expect(page.getByTestId("records")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Export|Refresh/ })).toHaveCount(0);
});

test("a pending dashboard shell does not invent a student name or enable request creation", async ({ page, context, nextURL }) => {
  await context.addCookies([{ name: "synthetic_transition_actor", value: "student", url: nextURL }]);
  await page.goto(nextURL + "/dashboard/new");
  await expect(page.getByTestId("records")).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("status", { name: "Loading document requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Synthetic/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New Request", exact: true })).toBeDisabled();
  await expect(page.getByTestId("records")).toHaveText("Overview records loaded");
  await expect(page.getByRole("heading", { name: "Welcome back, Synthetic!", exact: true })).toBeVisible();
});

test("rapid destination changes and back/forward navigation retain the matching banner and sidebar", async ({ page, context, nextURL }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await context.addCookies([{ name: "synthetic_transition_actor", value: "admin", url: nextURL }]);
  await page.goto(nextURL + "/admin");
  await expect(page.getByTestId("records")).toHaveText("Command center records loaded");
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await page.getByRole("link", { name: "Student Directory", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Student Directory", exact: true })).toBeVisible({ timeout: 700 });
  await page.getByRole("link", { name: "System Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "System Settings", exact: true })).toBeVisible({ timeout: 700 });
  await expect(page.getByTestId("records")).toHaveCount(0);
  await expect(page.getByTestId("records")).toHaveText("settings records loaded");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Student Directory", exact: true })).toBeVisible();
  await expect(page.getByTestId("records")).toHaveText("students records loaded");
  await page.goForward();
  await expect(page.getByRole("heading", { name: "System Settings", exact: true })).toBeVisible();
  await expect(page.getByTestId("records")).toHaveText("settings records loaded");
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
});

test("password sign-in obtains the authorized document without a workspace interstitial", async ({ page, nextURL }) => {
  await page.goto(nextURL + "/sign-in");
  await page.getByLabel("Email address", { exact: true }).fill("synthetic@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password-not-real");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(nextURL + "/dashboard");
  await expect(page.getByTestId("records")).toHaveText("Overview records loaded");
  await expect(page.getByText("Opening your workspace", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Checking account access" })).toHaveCount(0);
});

test("logout returns directly to the actual sign-in page without an anonymous session request", async ({ page, context, nextURL }) => {
  await context.addCookies([{ name: "synthetic_transition_actor", value: "student", url: nextURL }]);
  let sessionReads = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/session") sessionReads++; });
  await page.goto(nextURL + "/dashboard");
  await expect(page.getByTestId("records")).toBeVisible();
  await expect.poll(() => sessionReads).toBeGreaterThan(0);
  const reads = sessionReads;
  await page.getByRole("button", { name: "Open profile menu for Synthetic Student" }).click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(nextURL + "/sign-in");
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page.getByTestId("records")).toHaveCount(0);
  expect(sessionReads).toBe(reads);
});

test("SSO uses the same fresh-document handoff", async ({ page, nextURL }) => {
  await page.goto(nextURL + "/sso-callback");
  await expect(page).toHaveURL(nextURL + "/dashboard");
  await expect(page.getByTestId("records")).toHaveText("Overview records loaded");
  await expect(page.getByText("Opening your workspace", { exact: false })).toHaveCount(0);
});
