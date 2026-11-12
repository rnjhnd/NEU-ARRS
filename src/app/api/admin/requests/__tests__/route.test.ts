import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getAdminQueueActor, loadAdminQueue, loadQueueExport, QueueLoadError } from "@/lib/admin-queue-data";
import { DEFAULT_QUEUE_QUERY, ADMIN_QUEUE_URL } from "@/lib/admin-queue-model";
import { fixtureQueue } from "../../../../../../scripts/admin-queue-fixture/model";
import { GET } from "../route";
import { GET as EXPORT } from "../export/route";
vi.mock("@/lib/admin-queue-data", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/admin-queue-data")>();
  return { ...actual, getAdminQueueActor: vi.fn(), loadAdminQueue: vi.fn(), loadQueueExport: vi.fn() };
});
const queue = fixtureQueue({ actorId: "staff_a", role: "employee", emailLookupFailed: false, items: [] });
const call = (path = ADMIN_QUEUE_URL) => GET(new Request("http://localhost" + path));
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getAdminQueueActor).mockResolvedValue({ actorId: "staff_a", role: "employee" }); vi.mocked(loadAdminQueue).mockResolvedValue(queue); vi.mocked(loadQueueExport).mockResolvedValue({ actorId: "staff_a", role: "employee", csv: '\uFEFF"Reference ID","Student Name"', emailLookupFailed: false }); });
afterEach(() => vi.restoreAllMocks());
it("returns a private canonical server page using normalized query controls", async () => {
  const response = await call(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(await response.json()).toEqual(queue); expect(loadAdminQueue).toHaveBeenCalledWith(DEFAULT_QUEUE_QUERY);
});
it.each(["page=0", "page=1.5", "page=1e2", "page=2&page=3", "sort=studentEmail", "direction=DROP", "status=UNKNOWN", "studentId=other", "search=" + "x".repeat(201)])("rejects forged/duplicate/unsupported controls (%s)", async controls => {
  const response = await call(ADMIN_QUEUE_URL + "&" + controls); expect(response.status).toBe(400); expect(getAdminQueueActor).toHaveBeenCalledOnce(); expect(loadAdminQueue).not.toHaveBeenCalled();
});
it.each([401, 403, 413, 503] as const)("returns sanitized loader status %s", async status => {
  vi.mocked(loadAdminQueue).mockRejectedValue(new QueueLoadError(status)); const response = await call(); expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("does not fabricate an empty feed on an unexpected database failure", async () => {
  vi.mocked(loadAdminQueue).mockRejectedValue(new Error("synthetic private database details")); const response = await call(); expect(response.status).toBe(500); expect(await response.text()).not.toContain("private database");
});
it("authenticates obsolete clients before returning a reload response", async () => {
  vi.mocked(getAdminQueueActor).mockRejectedValue(new QueueLoadError(401)); expect((await call("/api/admin/requests?format=queue-v1")).status).toBe(401); expect(loadAdminQueue).not.toHaveBeenCalled();
  vi.mocked(getAdminQueueActor).mockResolvedValue({ actorId: "staff_a", role: "employee" }); expect((await call("/api/admin/requests?format=queue-v1")).status).toBe(409);
});
it("passes bounded search, filter, and sorting options to the authorized loader", async () => {
  expect((await call(ADMIN_QUEUE_URL + "&page=3&search=Student&status=PROCESSING&sort=studentName&direction=asc")).status).toBe(200);
  expect(loadAdminQueue).toHaveBeenCalledWith({ ...DEFAULT_QUEUE_QUERY, page: 3, search: "Student", status: "PROCESSING", sort: "studentName", direction: "asc" });
});
it("exports a separate private attachment with verified identity headers", async () => {
  const response = await EXPORT(new Request("http://localhost/api/admin/requests/export?format=queue-export-v1&from=2026-01-01&to=2026-01-31"));
  expect(response.status).toBe(200); expect(response.headers.get("content-type")).toContain("text/csv"); expect(response.headers.get("x-queue-actor")).toBe("staff_a"); expect(response.headers.get("content-disposition")).toContain("attachment;"); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(loadQueueExport).toHaveBeenCalledWith({ from: "2026-01-01", to: "2026-01-31" });
});
it.each(["", "format=queue-export-v1&from=2026-01-01", "format=queue-export-v1&from=2026-02-30&to=2026-03-01", "format=queue-export-v1&from=2026-02-02&to=2026-01-01", "format=queue-export-v1&studentId=other"])("rejects invalid export controls (%s)", async query => {
  expect((await EXPORT(new Request("http://localhost/api/admin/requests/export?" + query))).status).toBe(400); expect(getAdminQueueActor).toHaveBeenCalled(); expect(loadQueueExport).not.toHaveBeenCalled();
});
it.each([401, 403, 413, 503] as const)("returns an export failure %s without a partial CSV", async status => {
  vi.mocked(loadQueueExport).mockRejectedValue(new QueueLoadError(status)); const response = await EXPORT(new Request("http://localhost/api/admin/requests/export?format=queue-export-v1")); expect(response.status).toBe(status); expect(response.headers.get("content-type")).toContain("application/json"); expect(await response.text()).not.toContain("Reference ID");
});
