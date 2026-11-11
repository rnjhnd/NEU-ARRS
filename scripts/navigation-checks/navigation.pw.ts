import { test as base, expect } from "@playwright/test";
import { startNavigationFixture } from "../navigation-fixture/server.mjs";

const test = base.extend<{ pageErrors: string[] }, { fixtureURL: string }>({
  fixtureURL: [async ({ browserName }, provideFixture) => {
    if (browserName !== "chromium") throw new Error("Navigation checks require the configured Chrome engine.");
    const server = await startNavigationFixture();
    try { await provideFixture(server.url); } finally { await server.close(); }
  }, { scope: "worker" }],
  pageErrors: [async ({ page, fixtureURL }, provideErrors) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      if (new URL(route.request().url()).origin === fixtureURL) return route.continue();
      errors.push("Unexpected outbound request: " + route.request().url());
      return route.abort();
    });
    await provideErrors(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
});

test.beforeEach(async ({ page, fixtureURL }) => {
  await page.goto(fixtureURL);
  await expect(page.getByRole("heading", { name: "Navigation verification" })).toBeVisible();
});

test("focus wraps inside the drawer, Escape restores focus, and background interaction resumes", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Open navigation", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Staff navigation" });
  const first = dialog.getByRole("link", { name: "NEU ARRS" });
  await expect(first).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Open profile menu for Admin Fixture" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await expect(page.getByRole("button", { name: "Background action" })).toHaveCount(0);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.move(380, 400); // Outside the panel, over its backdrop.
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(150); // Let the browser apply the wheel's default action.
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Background action" }).click();
  await expect(page.getByLabel("Background clicks")).toHaveText("1");
});

test("clicking the backdrop dismisses the drawer", async ({ page }) => {
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The panel is still animating after it becomes visible. The viewport edge
  // stays outside it throughout the transition.
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Responsive test viewport missing.");
  await page.mouse.click(viewport.width - 5, 150);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeFocused();
});

test("a nested profile menu handles Escape before the parent dialog", async ({ page }) => {
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const profile = dialog.getByRole("button", { name: "Open profile menu for Admin Fixture" });
  await profile.click();
  await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(profile).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("desktop resize removes modal locks and returning to phone keeps the drawer closed", async ({ page }) => {
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Background action" }).click();
  await expect(page.getByLabel("Background clicks")).toHaveText("1");
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("link", { name: "System Settings", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("link navigation and an external route update both close open navigation", async ({ page }) => {
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Student Directory" }).click();
  await expect(page).toHaveURL(/\/admin\/students$/);
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Student Directory" })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Navigate shortly" }).click();
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("switching accounts closes the drawer and removes the previous identity and admin links", async ({ page }) => {
  await page.getByRole("button", { name: "Switch account shortly" }).click();
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Authentication: Employee", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "Open profile menu for Admin Fixture" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Open profile menu for Employee Fixture" })).toBeVisible();
  await expect(dialog.getByRole("navigation").getByRole("link")).toHaveCount(2);
  await expect(dialog.getByRole("link", { name: "Financial Analytics" })).toHaveCount(0);
});

test("failed sign-out remains retryable and a successful retry clears profile UI", async ({ page }) => {
  await page.getByRole("button", { name: "Fail next sign-out" }).click();
  await page.locator("header").getByRole("button", { name: "Open profile menu for Admin Fixture" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page.getByRole("menuitem", { name: "Signing out..." })).toBeDisabled();
  await expect(page.getByLabel("Sign-out attempts")).toHaveText("1");
  await expect(page.getByRole("alert")).toHaveText("Sign-out could not be confirmed. Please try again.");
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page.getByLabel("Sign-out attempts")).toHaveText("2");
  await expect(page.getByText("Authentication: Signed out", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open profile menu/ })).toHaveCount(0);
  await expect(page.getByText("Admin Fixture", { exact: true })).toHaveCount(0);
});

test("system dark mode toggles to light and back", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("phone drawer keeps profile controls inside the viewport", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Open profile menu for Admin Fixture" })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath("mobile-drawer.png") });
});
