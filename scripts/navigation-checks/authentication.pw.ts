import { test as base, expect, type Page } from "@playwright/test";
import { startComponentFixture } from "../navigation-fixture/server.mjs";
type State = { calls: { kind: string; input: Record<string, string> }[]; actionStatus: number; actionBody: object; delay: number;
  sessionStatus: number; sessionBody: object; signouts: number };
const test = base.extend<{ state: State }, { fixtureURL: string }>({
  fixtureURL: [async ({ browserName }, provide) => { if (browserName !== "chromium") throw new Error("Chrome required"); const fixture = await startComponentFixture("authentication-fixture"); try { await provide(fixture.url); } finally { await fixture.close(); } }, { scope: "worker" }],
  state: async ({ page, fixtureURL }, provide) => {
    const state: State = { calls: [], actionStatus: 200, actionBody: { success: true, requestId: "synthetic_request", status: "complete" }, delay: 0,
      sessionStatus: 200, sessionBody: { userId: "student_synthetic", role: "student" }, signouts: 0 };
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => { if (new URL(route.request().url()).origin === fixtureURL) return route.continue(); errors.push("Unexpected outbound request"); return route.abort(); });
    await page.route("**/fixture/action", async route => {
      state.calls.push(route.request().postDataJSON()); if (state.delay) await new Promise(done => setTimeout(done, state.delay));
      await route.fulfill({ status: state.actionStatus, json: state.actionBody });
    });
    await page.route("**/api/session", route => route.fulfill({ status: state.sessionStatus, json: state.sessionBody }));
    await page.route("**/fixture/signout", route => { state.signouts++; return route.fulfill({ json: {} }); });
    await provide(state); expect(errors).toEqual([]);
  },
});
async function fillRequest(page: Page) {
  await page.getByLabel("Full Name", { exact: true }).fill("Synthetic Student");
  await page.getByLabel("Student Number", { exact: true }).fill("22-12345-123");
  await page.getByRole("button", { name: /^Transcript/ }).click();
  await page.getByRole("button", { name: "Employment", exact: true }).click();
  await page.getByRole("button", { name: /^Cash at Window/ }).click();
}
test("student selection is keyboard accessible and submits an exact actor-bound intent", async ({ page, fixtureURL, state }, info) => {
  await page.goto(fixtureURL); await fillRequest(page);
  await page.getByRole("button", { name: /^Transcript/ }).focus(); await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /^Transcript/ })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: info.outputPath("student-request.png"), fullPage: true });
  await page.getByRole("button", { name: "Submit Request", exact: true }).click(); await expect(page.getByText("Dashboard reached")).toBeVisible();
  expect(state.calls).toHaveLength(1); expect(state.calls[0].input).toMatchObject({ studentName: "Synthetic Student", documentType: "TOR", purpose: "EMPLOYMENT", paymentMethod: "cash" });
  expect(state.calls[0].input.submissionKey).toMatch(/^[a-f0-9-]{36}$/); expect(state.calls[0].input).not.toHaveProperty("studentId");
});
test("unknown submission freezes fields and retries the identical payload once", async ({ page, fixtureURL, state }) => {
  state.actionStatus = 500; await page.goto(fixtureURL); await fillRequest(page); await page.getByRole("button", { name: "Submit Request", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry same request" })).toBeEnabled(); await expect(page.getByLabel("Full Name", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Employment", exact: true })).toBeDisabled();
  state.actionStatus = 200; await page.getByRole("button", { name: "Retry same request" }).click(); await expect(page.getByText("Dashboard reached")).toBeVisible();
  expect(state.calls).toHaveLength(2); expect(state.calls[1].input).toEqual(state.calls[0].input);
});
test("synchronous double submission is guarded and all request fields are locked", async ({ page, fixtureURL, state }) => {
  state.delay = 300; await page.goto(fixtureURL); await fillRequest(page);
  await page.locator("form").evaluate(form => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await expect(page.getByLabel("Full Name", { exact: true })).toBeDisabled(); await expect(page.getByText("Dashboard reached")).toBeVisible(); expect(state.calls).toHaveLength(1);
});
test("late success cannot navigate or clear a different account's request state", async ({ page, fixtureURL, state }) => {
  state.delay = 500; await page.goto(fixtureURL); await fillRequest(page);
  const response = page.waitForResponse("**/fixture/action"); await page.getByRole("button", { name: "Submit Request", exact: true }).click();
  await page.getByRole("button", { name: "Switch student" }).click(); await expect(page.getByRole("alert")).toContainText("Account access changed");
  await response; await expect(page.getByText("Dashboard reached")).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("neu-arrs:new-request:v2:student_synthetic"))).toBeTruthy();
});
test("explicit validation rejection permits correction and replaces no stored personal data", async ({ page, fixtureURL, state }) => {
  state.actionBody = { success: false, code: "invalid", error: "Invalid form data" }; await page.goto(fixtureURL); await fillRequest(page);
  await page.getByRole("button", { name: "Submit Request", exact: true }).click(); await expect(page.getByLabel("Full Name", { exact: true })).toBeEnabled();
  expect(await page.evaluate(() => Object.values(sessionStorage).join(" "))).not.toContain("Synthetic Student");
});
test("ignores another account's or malformed stored intent", async ({ page, fixtureURL, state }) => {
  await page.addInitScript(() => { sessionStorage.setItem("neu-arrs:new-request:v1", "other-account-intent"); sessionStorage.setItem("neu-arrs:new-request:v2:student_synthetic", "malformed"); });
  await page.goto(fixtureURL); await fillRequest(page); await page.getByRole("button", { name: "Submit Request", exact: true }).click(); await expect(page.getByText("Dashboard reached")).toBeVisible();
  expect(state.calls[0].input.submissionKey).toMatch(/^[a-f0-9-]{36}$/);
});
test("a client role change hides a student draft", async ({ page, fixtureURL }) => {
  await page.goto(fixtureURL); await fillRequest(page); await page.getByRole("button", { name: "Change role" }).click(); await expect(page.getByRole("alert")).toContainText("Account access changed"); await expect(page.locator("form")).toHaveCount(0);
});
test("session outages hide private content without signing out, then recover", async ({ page, fixtureURL, state }) => {
  await page.clock.install(); state.sessionStatus = 503; await page.goto(fixtureURL + "?screen=session"); await expect(page.getByText("Your session could not be verified.", { exact: false })).toBeVisible();
  await expect(page.getByText("Verified private content")).toHaveCount(0); expect(state.signouts).toBe(0);
  state.sessionStatus = 200; await page.clock.runFor(30_100); await expect(page.getByText("Verified private content")).toBeVisible(); expect(state.signouts).toBe(0);
});
for (const status of [401, 403, 404]) test(`session ${status} removes private content without an automatic sign-out`, async ({ page, fixtureURL, state }) => {
  await page.clock.install(); await page.goto(fixtureURL + "?screen=session"); await expect(page.getByText("Verified private content")).toBeVisible();
  state.sessionStatus = status; await page.clock.runFor(30_100); await expect(page.getByText("Verified private content")).toHaveCount(0); await expect(page.getByRole("heading", { name: "Account access restricted" })).toBeVisible(); expect(state.signouts).toBe(0);
});
test("mismatched and malformed session snapshots cannot reveal private content", async ({ page, fixtureURL, state }) => {
  state.sessionBody = { userId: "other_student", role: "student" }; await page.goto(fixtureURL + "?screen=session"); await expect(page.getByRole("heading", { name: "Account access restricted" })).toBeVisible();
  state.sessionBody = {}; await page.reload(); await expect(page.getByRole("heading", { name: "Account access unavailable" })).toBeVisible(); expect(state.signouts).toBe(0);
});

test("verified student leaves the staff portal without revealing its content or signing out", async ({ page, fixtureURL, state }) => {
  await page.goto(fixtureURL + "?screen=session");
  await expect(page.getByText("Verified private content")).toBeVisible();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/session", async route => { await pending; await route.fulfill({ json: state.sessionBody }); });
  await page.getByRole("button", { name: "Navigate staff" }).click();
  await expect(page).toHaveURL(fixtureURL + "/admin");
  await expect(page.getByText("Verified private content")).toHaveCount(0);
  release();
  await expect(page).toHaveURL(fixtureURL + "/dashboard");
  await expect(page.getByText("Verified private content")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Account access restricted" })).toHaveCount(0);
  expect(state.signouts).toBe(0);
});

for (const role of ["employee", "admin"]) test(`verified ${role} leaves the student portal for the staff workspace`, async ({ page, fixtureURL, state }) => {
  state.sessionBody = { userId: "student_synthetic", role };
  await page.goto(fixtureURL + "?screen=session");
  await expect(page).toHaveURL(fixtureURL + "/admin");
  await expect(page.getByText("Verified private content")).toBeVisible();
  expect(state.signouts).toBe(0);
});

test("a mismatched account cannot trigger a role-based portal redirect", async ({ page, fixtureURL, state }) => {
  state.sessionBody = { userId: "other_student", role: "admin" };
  await page.goto(fixtureURL + "?screen=session");
  await expect(page.getByRole("heading", { name: "Account access restricted" })).toBeVisible();
  await expect(page).toHaveURL(fixtureURL + "/dashboard/guard-check");
  await expect(page.getByText("Verified private content")).toHaveCount(0);
  expect(state.signouts).toBe(0);
});
test("sign-in double activation is guarded and finalization precedes navigation", async ({ page, fixtureURL, state }) => {
  state.delay = 200; await page.goto(fixtureURL + "?screen=signin"); await page.getByLabel(/^Email address$/i).fill("synthetic@example.invalid"); await page.getByLabel("Password", { exact: true }).fill("synthetic-password-not-real");
  await page.locator("form").evaluate(form => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await expect.poll(() => state.calls.map(call => call.kind)).toEqual(["signin-create", "signin-finalize"]);
});
test("sign-up and email verification use one in-flight operation", async ({ page, fixtureURL, state }) => {
  await page.goto(fixtureURL + "?screen=signup"); await page.getByLabel(/^First name$/i).fill("Synthetic"); await page.getByLabel(/^Last name$/i).fill("Student"); await page.getByLabel(/^Email address$/i).fill("synthetic@example.invalid"); await page.getByLabel("Password", { exact: true }).fill("synthetic-password-not-real");
  await page.getByRole("button", { name: "Continue", exact: true }).click(); await page.getByLabel("Verification Code", { exact: true }).fill("123456"); await page.getByRole("button", { name: "Verify Email", exact: true }).click();
  await expect.poll(() => state.calls.map(call => call.kind)).toEqual(["signup-create", "send-code", "verify-code", "signup-finalize"]);
});
