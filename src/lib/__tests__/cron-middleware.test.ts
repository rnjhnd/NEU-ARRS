import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import middleware from "../../proxy";

const spies = vi.hoisted(() => ({ protect: vi.fn(), session: vi.fn(), redis: vi.fn(), role: "student" }));
vi.mock("@clerk/nextjs/server", () => ({
  createRouteMatcher: (patterns: string[]) => (req: NextRequest) => patterns.some(pattern => pattern.endsWith("(.*)")
    ? req.nextUrl.pathname.startsWith(pattern.slice(0, -4)) : req.nextUrl.pathname === pattern),
  clerkMiddleware: (handler: (auth: { (): Promise<{ sessionClaims: { metadata: { role: string } } }>; protect: () => Promise<void> }, req: NextRequest) => Promise<unknown>) => async (req: NextRequest) => {
    spies.session();
    const auth = Object.assign(async () => ({ sessionClaims: { metadata: { role: spies.role } } }), { protect: spies.protect });
    return handler(auth, req);
  },
}));
vi.mock("@upstash/redis", () => ({ Redis: class { constructor() { spies.redis(); throw new Error("Redis must not initialize for cron"); } } }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class { static slidingWindow() { return {}; } } }));
const secret = "synthetic_cron_secret_for_tests_only";
// No waitUntil work is scheduled by this middleware in these scenarios.
const event = {} as NextFetchEvent;
const request = (path: string, headers: HeadersInit = {}, method = "GET") => new NextRequest("https://example.invalid" + path, { headers, method });

beforeEach(() => {
  vi.clearAllMocks(); spies.role = "student";
  spies.protect.mockResolvedValue(undefined);
  vi.stubEnv("CRON_SECRET", secret);
  vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("Exact cron path service authentication", () => {
  it("admits the notification worker only with the service secret", async () => {
    expect((await middleware(request("/api/cron/deliver-notifications"), event))?.status).toBe(401);
    const accepted = await middleware(request("/api/cron/deliver-notifications", { authorization: "Bearer " + secret }), event);
    expect(accepted?.headers.get("x-middleware-next")).toBe("1");
    expect(spies.session).not.toHaveBeenCalled();
  });
  it("admits a valid scheduler request without Clerk or Redis", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "malformed");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "synthetic");
    const result = await middleware(request("/api/cron/cleanup-unpaid", { authorization: "Bearer " + secret }), event);
    expect(result?.headers.get("x-middleware-next")).toBe("1");
    expect(spies.session).not.toHaveBeenCalled();
    expect(spies.protect).not.toHaveBeenCalled();
    expect(spies.redis).not.toHaveBeenCalled();
  });
  it.each([{}, { authorization: "Bearer incorrect" }, { cookie: "__session=synthetic", "user-agent": "vercel-cron/1.0" }] as HeadersInit[])("rejects missing or wrong service credentials (%j)", async headers => {
    expect((await middleware(request("/api/cron/cleanup-unpaid", headers), event))?.status).toBe(401);
    expect(spies.session).not.toHaveBeenCalled();
  });
  it("fails closed when the secret is missing", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    expect((await middleware(request("/api/cron/cleanup-unpaid"), event))?.status).toBe(503);
    expect(spies.session).not.toHaveBeenCalled();
  });
  it("rejects HEAD without reaching the route or user authentication", async () => {
    expect((await middleware(request("/api/cron/cleanup-unpaid", { authorization: "Bearer " + secret }, "HEAD"), event))?.status).toBe(405);
    expect(spies.session).not.toHaveBeenCalled();
  });
  it.each(["/api/cron/cleanup-unpaid-extra", "/api/cron/other", "/api/cron/cleanup-unpaid/nested", "/api/cron/deliver-notifications-extra"])("does not exempt a sibling or prefix route (%s)", async path => {
    await middleware(request(path, { authorization: "Bearer " + secret }), event);
    expect(spies.session).toHaveBeenCalledOnce();
    expect(spies.protect).toHaveBeenCalledOnce();
  });
});

describe("Existing user route protection", () => {
  it("continues to protect the student dashboard", async () => {
    await middleware(request("/dashboard"), event);
    expect(spies.protect).toHaveBeenCalledOnce();
  });
  it("authenticates staff routes and leaves role verification to the DAL", async () => {
    const response = await middleware(request("/admin/finance"), event);
    expect(response?.headers.get("x-middleware-next")).toBe("1"); expect(spies.protect).toHaveBeenCalledOnce();
  });
  it("does not treat an employee JWT as authoritative routing data", async () => {
    spies.role = "employee";
    const response = await middleware(request("/admin/finance"), event);
    expect(response?.headers.get("x-middleware-next")).toBe("1"); expect(spies.protect).toHaveBeenCalledOnce();
  });
  it("does not redirect using potentially stale admin JWT metadata", async () => {
    spies.role = "admin";
    const response = await middleware(request("/dashboard"), event);
    expect(response?.headers.get("x-middleware-next")).toBe("1"); expect(spies.protect).toHaveBeenCalledOnce();
  });
});
