import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { getVerifiedActor, AccessError } from "@/lib/auth";
import { loadMoneyMovements } from "@/lib/money-movement-data";
import { FinanceLoadError } from "@/lib/finance-data";
import { GET } from "../route";
vi.mock("@/lib/money-movement-data", () => ({ loadMoneyMovements: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getVerifiedActor).mockResolvedValue({ userId: "synthetic_admin", role: "admin" }); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
const call = (query = "format=money-movements-v2") => GET(new Request("https://example.invalid/api/admin/finance/movements?" + query));
it.each(["employee", "student"] as const)("denies %s before loader access", async role => {
  vi.mocked(getVerifiedActor).mockResolvedValue({ userId: "synthetic", role }); const response = await call(); expect(response.status).toBe(403); expect(loadMoneyMovements).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("denies a missing session", async () => { vi.mocked(getVerifiedActor).mockRejectedValue(new AccessError(401)); expect((await call()).status).toBe(401); expect(loadMoneyMovements).not.toHaveBeenCalled(); });
it.each(["period=bad", "period=custom", "undatedPage=0", "period=all&period=7days", "unexpected=value"])("rejects invalid report controls (%s)", async query => {
  expect((await call("format=money-movements-v2&" + query)).status).toBe(400); expect(loadMoneyMovements).not.toHaveBeenCalled();
});
it("version-checks clients and sanitizes loader failures", async () => {
  expect((await call("format=old")).status).toBe(409); expect(loadMoneyMovements).not.toHaveBeenCalled();
  vi.mocked(loadMoneyMovements).mockRejectedValue(new Error("Private database details")); const failed = await call(); expect(failed.status).toBe(500); expect(await failed.text()).not.toContain("Private database");
  vi.mocked(loadMoneyMovements).mockRejectedValue(new FinanceLoadError(413)); expect((await call()).status).toBe(413);
});
it("returns private no-store success with parsed controls", async () => {
  vi.mocked(loadMoneyMovements).mockResolvedValue({ actorId: "synthetic_admin" } as Awaited<ReturnType<typeof loadMoneyMovements>>);
  const result = await call(); expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("private, no-store"); expect(loadMoneyMovements).toHaveBeenCalledWith({ period: "7days", undatedPage: 1 });
});
