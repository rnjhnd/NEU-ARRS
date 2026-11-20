import { test as base, expect, type Page } from "@playwright/test";
import { startComponentFixture } from "../navigation-fixture/server.mjs";
type State = { calls: { kind: string; input: Record<string, string> }[]; actionStatus: number; actionBody: object; delay: number;
  sessionStatus: number; sessionBody: object; signouts: number; sessionCalls: number; signoutStatus: number;
  pageStatus: number; pageBody: object | null; pageCalls: number };
const test = base.extend<{ state: State }, { fixtureURL: string }>({
  fixtureURL: [async ({ browserName }, provide) => { if (browserName !== "chromium") throw new Error("Chrome required"); const fixture = await startComponentFixture("authentication-fixture"); try { await provide(fixture.url); } finally { await fixture.close(); } }, { scope: "worker" }],
  state: async ({ page, fixtureURL }, provide) => {
    const state: State = { calls: [], actionStatus: 200, actionBody: { success: true, requestId: "synthetic_request", status: "complete" }, delay: 0,
      sessionStatus: 200, sessionBody: { userId: "student_synthetic", role: "student" }, signouts: 0, sessionCalls: 0, signoutStatus: 200,
      pageStatus: 200, pageBody: null, pageCalls: 0 };
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => { if (new URL(route.request().url()).origin === fixtureURL) return route.continue(); errors.push("Unexpected outbound request"); return route.abort(); });
    await page.route("**/fixture/action", async route => {
      state.calls.push(route.request().postDataJSON()); if (state.delay) await new Promise(done => setTimeout(done, state.delay));
      await route.fulfill({ status: state.actionStatus, json: state.actionBody });
    });
    await page.route("**/api/session", route => { state.sessionCalls++; return route.fulfill({ status: state.sessionStatus, json: state.sessionBody }); });
    await page.route("**/fixture/page?*", route => {
      state.pageCalls++;
      const actor = state.sessionBody as { userId: string; role: string };
      const path = new URL(route.request().url()).searchParams.get("path") ?? "";
      const forbidden = actor.role !== "admin" && /^\/admin\/(finance|settings|documents|notifications)(\/|$)/.test(path);
      return route.fulfill({ status: forbidden ? 403 : state.pageStatus,
        json: state.pageBody ?? { ...actor, sessionId: "session_" + actor.userId } });
    });
    await page.route("**/fixture/signout", route => { state.signouts++; return route.fulfill({ status: state.signoutStatus, json: {} }); });
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
test("request identity is prefilled, student numbers auto-format, and invalid values are checked on blur", async ({ page, fixtureURL }) => {
  await page.goto(fixtureURL);
  const name = page.getByLabel("Full Name", { exact: true });
  const number = page.getByLabel("Student Number", { exact: true });
  await expect(name).toHaveValue("Previous Synthetic Student");
  await expect(number).toHaveValue("21-23456-789");
  await expect(page.getByText(/Registrar staff must verify/)).toHaveCount(0);

  await number.fill("22123");
  await expect(number).toHaveValue("22-123");
  await name.focus();
  await expect(number).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText("22-12345-123");

  await number.fill("2212345123");
  await expect(number).toHaveValue("22-12345-123");
  await name.focus();
  await expect(number).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toHaveCount(0);
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
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) test(`an unverified client entry at ${viewport.width}px withholds private content without a workspace screen`, async ({ page, fixtureURL, state }, info) => {
  await page.setViewportSize(viewport);
  const dark = viewport.width === 1440;
  await page.emulateMedia({ colorScheme: dark ? "dark" : "light", reducedMotion: "reduce" });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/session", async route => { await pending; await route.fulfill({ json: state.sessionBody }); });
  await page.goto(fixtureURL + "?screen=session");
  const loading = page.getByRole("status", { name: "Checking account access", exact: true });
  try {
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(page.getByText("Opening your workspace", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Verified private content")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(loading.locator('[data-slot="skeleton"]')).toHaveCount(0);
    expect(await loading.locator("svg").evaluateAll(elements => elements.every(element => getComputedStyle(element).animationName === "none"))).toBe(true);
    await expect(page.getByRole("heading", { name: "Student workspace" })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`access-transition-${dark ? "dark" : "light"}.png`), fullPage: true });
  } finally { release(); }
  await expect(loading).toHaveCount(0);
  await expect(page.getByText("Verified private content")).toBeVisible();
});

for (const role of ["student", "employee", "admin"]) test(`the verified ${role} document renders without waiting for a duplicate session check`, async ({ page, fixtureURL, state }) => {
  state.sessionBody = { userId: "student_synthetic", role };
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/session", async route => { await pending; await route.fulfill({ json: state.sessionBody }); });
  try {
    await page.goto(fixtureURL + "?screen=session&bootstrap=" + role);
    await expect(page.getByText("Verified private content")).toBeVisible();
    await expect(page.getByRole("status", { name: "Checking account access", exact: true })).toHaveCount(0);
    expect(state.pageCalls).toBe(0);
    await expect(page.getByText("Opening your workspace", { exact: false })).toHaveCount(0);
  } finally { release(); }
});

test("the server-authorized document does not wait for Clerk hydration", async ({ page, fixtureURL, state }) => {
  await page.goto(fixtureURL + "?screen=session&bootstrap=student&sdk=pending");
  await expect(page.getByText("Verified private content")).toBeVisible();
  await expect.poll(() => state.sessionCalls).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Resolve client session" }).click();
  await expect.poll(() => state.sessionCalls).toBeGreaterThan(0);
  await expect(page.getByText("Verified private content")).toBeVisible();
});

test("server-rendered content still loses revoked access while the SDK is delayed", async ({ page, fixtureURL, state }) => {
  await page.goto(fixtureURL + "?screen=session&bootstrap=student&sdk=pending");
  await expect(page.getByText("Verified private content")).toBeVisible();
  await expect.poll(() => state.sessionCalls).toBeGreaterThan(0);
  state.sessionStatus = 403;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Account access restricted" })).toBeVisible();
  await expect(page.getByText("Verified private content")).toHaveCount(0);
});

test("a bootstrap for another session cannot display a cached private document", async ({ page, fixtureURL, state }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/session", async route => { await pending; await route.fulfill({ json: state.sessionBody }); });
  try {
    await page.goto(fixtureURL + "?screen=session&bootstrap=student&bootstrap-session=old_session");
    await expect(page.getByRole("status", { name: "Checking account access", exact: true })).toBeVisible();
    await expect(page.getByText("Verified private content")).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByText("Verified private content")).toBeVisible();
});

for (const role of ["student", "employee", "admin"]) test(`${role} navigation uses the server page result without another session RPC`, async ({ page, fixtureURL, state }, info) => {
  state.sessionBody = { userId: "student_synthetic", role };
  await page.goto(fixtureURL + "?screen=session");
  await expect(page.getByText("Verified private content")).toBeVisible();
  const sessionCalls = state.sessionCalls;
  const previousPath = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Collapse fixture sidebar" }).click();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/fixture/page?*", async route => { await pending; const actor = state.sessionBody as { userId: string }; await route.fulfill({ json: { ...actor, sessionId: "session_" + actor.userId } }); });
  await page.getByRole("button", { name: "Navigate protected" }).click();
  try {
    await expect(page.getByRole("heading", { name: role === "student" ? "Student workspace" : "Staff workspace", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Expand fixture sidebar" })).toBeVisible();
    await expect(page.getByRole("status", { name: "Checking account access", exact: true })).toHaveCount(0);
    await expect(page.getByText("Verified private content")).toHaveAttribute("data-route", previousPath);
    expect(state.sessionCalls).toBe(sessionCalls);
    await page.screenshot({ path: info.outputPath(`${role}-navigation.png`), fullPage: true });
  } finally { release(); }
  await expect(page.getByText("Verified private content")).toHaveAttribute("data-route", role === "student" ? "/dashboard/new" : "/admin/students");
  await expect(page.getByRole("button", { name: "Expand fixture sidebar" })).toBeVisible();
  expect(state.sessionCalls).toBe(sessionCalls);
});

test("a cached page from an older session stays hidden and can recover with a fresh server result", async ({ page, fixtureURL, state }) => {
  await page.clock.install();
  await page.goto(fixtureURL + "?screen=session");
  await expect(page.getByText("Verified private content")).toBeVisible();
  state.pageBody = { userId: "student_synthetic", role: "student", sessionId: "old_session" };
  await page.getByRole("button", { name: "Navigate protected", exact: true }).click();
  await expect(page.getByRole("status", { name: "Checking account access", exact: true })).toBeVisible();
  await expect(page.getByText("Verified private content")).toHaveCount(0);
  await page.clock.runFor(15_100);
  await expect(page.getByRole("alert")).toContainText("This page could not be verified");
  expect(state.pageCalls).toBeLessThanOrEqual(5);
  state.pageBody = null;
  await page.getByRole("button", { name: "Retry page", exact: true }).click();
  await expect(page.getByText("Verified private content")).toBeVisible();
});

test("a cached administrator result cannot restore access after a role downgrade", async ({ page, fixtureURL, state }) => {
  await page.clock.install();
  state.sessionBody = { userId: "student_synthetic", role: "admin" };
  await page.goto(fixtureURL + "?screen=session");
  await expect(page.getByText("Verified private content")).toBeVisible();
  await page.getByRole("button", { name: "Navigate finance", exact: true }).click();
  await expect(page.getByText("Verified private content")).toHaveAttribute("data-route", "/admin/finance");
  const oldAccess = { userId: "student_synthetic", role: "admin", sessionId: "session_student_synthetic" };
  let cachedRefreshes = 0;
  const cached = async (route: import("@playwright/test").Route) => { cachedRefreshes++; await route.fulfill({ json: oldAccess }); };
  await page.route("**/fixture/page?*", cached);
  state.sessionBody = { userId: "student_synthetic", role: "employee" };
  // Settle network revalidation before advancing the recovery deadline. Jumping
  // across both deadlines can expire an in-flight session request artificially.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "Open profile menu for Synthetic Student" }).click();
  await expect(page.getByText("Employee", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(() => cachedRefreshes).toBeGreaterThan(0);
  await expect(page.getByText("Verified private content")).toHaveCount(0);
  await page.clock.runFor(15_100);
  await expect(page.getByRole("alert")).toContainText("This page could not be verified");
  expect(cachedRefreshes).toBeLessThanOrEqual(2);
  await page.unroute("**/fixture/page?*", cached);
  await page.getByRole("button", { name: "Retry page", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Page access restricted");
  await expect(page.getByText("Verified private content")).toHaveCount(0);
});

test("an employee's server-denied finance page stays hidden without an extra navigation session RPC", async ({ page, fixtureURL, state }) => {
  state.sessionBody = { userId: "student_synthetic", role: "employee" };
  await page.goto(fixtureURL + "?screen=session");
  await expect(page.getByText("Verified private content")).toBeVisible();
  const calls = state.sessionCalls;
  await page.getByRole("button", { name: "Navigate finance", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Page access restricted");
  await expect(page.getByText("Verified private content")).toHaveCount(0);
  expect(state.sessionCalls).toBe(calls);
});

for (const event of ["focus", "online"]) test(`${event} revalidation still removes revoked access`, async ({ page, fixtureURL, state }) => {
  await page.goto(fixtureURL + "?screen=session");
  await expect(page.getByText("Verified private content")).toBeVisible();
  state.sessionStatus = 403;
  await page.evaluate(name => window.dispatchEvent(new Event(name)), event);
  await expect(page.getByRole("heading", { name: "Account access restricted" })).toBeVisible();
  await expect(page.getByText("Verified private content")).toHaveCount(0);
});

test("account switching hides the previous shell immediately and rejects a late old-account response", async ({ page, fixtureURL, state }) => {
  await page.goto(fixtureURL + "?screen=session");
  await expect(page.getByText("Verified private content")).toBeVisible();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/session", async route => { await pending; await route.fulfill({ json: state.sessionBody }); });
  await page.getByRole("button", { name: "Switch student" }).click();
  await expect(page.getByRole("heading", { name: "Student workspace" })).toHaveCount(0);
  await expect(page.getByText("Verified private content")).toHaveCount(0);
  release();
  await expect(page.getByRole("heading", { name: "Account access restricted" })).toBeVisible();
});

test("logout reaches the public page without starting an anonymous workspace check", async ({ page, fixtureURL, state }) => {
  await page.goto(fixtureURL + "?screen=session");
  await expect(page.getByText("Verified private content")).toBeVisible();
  const calls = state.sessionCalls;
  await page.getByRole("button", { name: "Open profile menu for Synthetic Student" }).click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(fixtureURL + "/sign-in");
  await expect(page.getByText("Verified private content")).toHaveCount(0);
  expect(state.signouts).toBe(1);
  expect(state.sessionCalls).toBe(calls);
});

test("failed logout keeps the current workspace and permits a deliberate retry", async ({ page, fixtureURL, state }) => {
  await page.goto(fixtureURL + "?screen=session");
  await expect(page.getByText("Verified private content")).toBeVisible();
  state.signoutStatus = 503;
  await page.getByRole("button", { name: "Open profile menu for Synthetic Student" }).click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Sign-out could not be confirmed");
  await expect(page.getByText("Verified private content")).toBeVisible();
  state.signoutStatus = 200;
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  expect(state.signouts).toBe(2);
});

test("returning from a public page cannot reuse an earlier access snapshot", async ({ page, fixtureURL, state }) => {
  await page.goto(fixtureURL + "?screen=session&bootstrap=student");
  await expect(page.getByText("Verified private content")).toBeVisible();
  await expect.poll(() => state.sessionCalls).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Navigate public", exact: true }).click();
  await expect(page.getByText("Public home")).toBeVisible();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/session", async route => { await pending; await route.fulfill({ status: 403, json: {} }); });
  await page.getByRole("button", { name: "Return protected", exact: true }).click();
  try {
    await expect(page.getByRole("status", { name: "Checking account access", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Student workspace" })).toHaveCount(0);
    await expect(page.getByText("Verified private content")).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByRole("heading", { name: "Account access restricted" })).toBeVisible();
});

test("a server-denied destination cannot reveal private page content", async ({ page, fixtureURL, state }) => {
  await page.goto(fixtureURL + "?screen=session");
  await expect(page.getByText("Verified private content")).toBeVisible();
  state.pageStatus = 403;
  await page.getByRole("button", { name: "Navigate protected", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Page access restricted");
  await expect(page.getByText("Verified private content")).toHaveCount(0);
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

test("SSO completes one callback before requesting a fresh authorized document", async ({ page, fixtureURL, state }) => {
  await page.goto(fixtureURL + "?screen=sso");
  await expect.poll(() => state.calls.map(call => call.kind)).toEqual(["oauth-callback"]);
  await expect(page).toHaveURL(fixtureURL + "/");
});

test("SSO rejects an unexpected cross-origin destination", async ({ page, fixtureURL, state }) => {
  state.actionBody = { destination: "https://other.example.invalid/" };
  await page.goto(fixtureURL + "?screen=sso");
  await expect(page.getByRole("alert")).toContainText("Sign-in could not be completed");
  expect(state.calls.map(call => call.kind)).toEqual(["oauth-callback"]);
  expect(new URL(page.url()).origin).toBe(fixtureURL);
});
test("sign-up and email verification use one in-flight operation", async ({ page, fixtureURL, state }) => {
  await page.goto(fixtureURL + "?screen=signup"); await page.getByLabel(/^First name$/i).fill("Synthetic"); await page.getByLabel(/^Last name$/i).fill("Student"); await page.getByLabel(/^Email address$/i).fill("synthetic@example.invalid"); await page.getByLabel("Password", { exact: true }).fill("synthetic-password-not-real");
  await page.getByRole("button", { name: "Continue", exact: true }).click(); await page.getByLabel("Verification Code", { exact: true }).fill("123456"); await page.getByRole("button", { name: "Verify Email", exact: true }).click();
  await expect.poll(() => state.calls.map(call => call.kind)).toEqual(["signup-create", "send-code", "verify-code", "signup-finalize"]);
});
