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

test("real Next navigation keeps the previous page, then shows only the data fallback", async ({ page, context, nextURL }, info) => {
  await context.addCookies([{ name: "synthetic_transition_actor", value: "student", url: nextURL }]);
  let sessionReads = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/session") sessionReads++; });
  await page.goto(nextURL + "/dashboard");
  await expect(page.getByTestId("records")).toHaveText("Overview records loaded");
  await expect.poll(() => sessionReads).toBeGreaterThan(0);
  const reads = sessionReads;
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page.getByRole("status", { name: "Loading destination" })).toBeVisible();
  await expect(page.getByTestId("records")).toHaveText("Overview records loaded");
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
  await expect(page.getByText("Opening your workspace", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Checking account access" })).toHaveCount(0);
  await expect(page.getByTestId("data-skeleton")).toBeVisible();
  await page.screenshot({ path: info.outputPath("next-single-data-fallback.png") });
  await expect(page.getByTestId("records")).toHaveText("Reports records loaded");
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
  expect(sessionReads).toBe(reads);
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
