import { beforeEach, expect, it, vi } from "vitest";
import { AccessError, getVerifiedActor } from "@/lib/auth";
import { GET } from "@/app/api/session/route";
beforeEach(() => vi.resetAllMocks());
it("returns only verified identity/role and prohibits caching", async () => {
  vi.mocked(getVerifiedActor).mockResolvedValue({ userId: "synthetic", role: "student" });
  const response = await GET(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(await response.json()).toEqual({ userId: "synthetic", role: "student" });
});
it.each([401, 403, 503] as const)("returns %s for a denied or unverifiable session", async status => {
  vi.mocked(getVerifiedActor).mockRejectedValue(new AccessError(status)); const response = await GET(); expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("sanitizes unexpected provider/database failures", async () => {
  vi.mocked(getVerifiedActor).mockRejectedValue(new Error("synthetic private connection details")); const response = await GET(); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
});
