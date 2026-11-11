import { beforeEach, expect, it, vi } from "vitest";
import { adminQueueSchema, mergeQueueChanges, queueCSV, queueSnapshotChanged, queueView, toQueueItem, type AdminQueue, type QueueItem } from "../admin-queue-model";
import { fetchAdminQueue } from "../admin-queue-fetcher";

const row: QueueItem = { id: "request_a", studentName: "Stored Student", studentNumber: "22-12345-123", studentEmail: "student@example.invalid",
  documentType: "Document", purpose: "PERSONAL", paymentMethod: "online", paymentStatus: "PAID", status: "PENDING_PAYMENT", cancelReason: null,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const queue: AdminQueue = { actorId: "staff_a", role: "employee", emailLookupFailed: false, items: [row] };
beforeEach(() => vi.resetAllMocks());

it("serializes the minimal queue DTO without provider or order internals", () => {
  const source = { ...row, studentId: "private", paymongoPaymentId: "private", submissionKey: "private", documentType: "GOOD_MORAL",
    createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
  const dto = toQueueItem(source, row.studentEmail);
  expect(dto.documentType).toBe("Good Moral Certificate");
  for (const key of ["studentId", "paymongoPaymentId", "submissionKey"]) expect(dto).not.toHaveProperty(key);
  expect(adminQueueSchema.safeParse({ ...queue, items: [dto] }).success).toBe(true);
});
it("rejects duplicate IDs, invalid dates, and unsupported staff roles", () => {
  for (const invalid of [{ ...queue, items: [row, row] }, { ...queue, items: [{ ...row, updatedAt: "invalid" }] }, { ...queue, role: "student" }]) {
    expect(adminQueueSchema.safeParse(invalid).success).toBe(false);
  }
});
it("filters/searches every displayed identity field and clamps shrinking or empty pages", () => {
  const items = Array.from({ length: 13 }, (_, i) => ({ ...row, id: "r" + String(i).padStart(2, "0") }));
  const sort = { key: "updatedAt", direction: "desc" } as const;
  expect(queueView(items, "ALL", "", sort, 2).items).toHaveLength(3);
  expect(queueView(items.slice(0, 2), "ALL", "", sort, 2).page).toBe(1);
  expect(queueView(items, "COMPLETED", "", sort, 2)).toMatchObject({ items: [], page: 1, totalPages: 1 });
  for (const search of ["stored", "22-123", "example.invalid", "document", "personal", "paid", "online"]) expect(queueView([row], "ALL", search, sort, 1).total).toBe(1);
  expect(items[0].id).toBe("r00");
});
it("sorts timestamps chronologically and resolves ties by ID", () => {
  const items = [{ ...row, id: "b", updatedAt: "2026-01-01T09:00:00+08:00" }, { ...row, id: "a", updatedAt: "2026-01-01T02:00:00Z" }];
  expect(queueView(items, "ALL", "", { key: "updatedAt", direction: "desc" }, 1).items.map(item => item.id)).toEqual(["a", "b"]);
  expect(queueView(items, "ALL", "", { key: "studentName", direction: "desc" }, 1).items.map(item => item.id)).toEqual(["a", "b"]);
});
it("detects changed/deleted snapshots without rebasing submitted versions", () => {
  expect(queueSnapshotChanged([row], [row])).toBe(false);
  expect(queueSnapshotChanged([row], [{ ...row, updatedAt: "2026-01-02T00:00:00.000Z" }])).toBe(true);
  expect(queueSnapshotChanged([row], [])).toBe(true);
});
it("merges committed versions without overwriting newer payment/status data", () => {
  const changes = [{ id: row.id, status: "CANCELLED" as const, paymentStatus: "PAID" as const, cancelReason: "Changed", updatedAt: "2026-01-02T00:00:00.000Z" }];
  expect(mergeQueueChanges(queue, changes).items[0].status).toBe("CANCELLED");
  const newer = { ...queue, items: [{ ...row, paymentStatus: "REFUNDED" as const, updatedAt: "2026-01-03T00:00:00.000Z" }] };
  expect(mergeQueueChanges(newer, changes).items[0].paymentStatus).toBe("REFUNDED");
  expect(queue.items[0].status).toBe("PENDING_PAYMENT");
});
it("escapes CSV quotes, commas and newlines and neutralizes spreadsheet formulas", () => {
  const csv = queueCSV([{ ...row, studentName: 'Last, "First"', documentType: '=HYPERLINK("https://example.invalid")', cancelReason: "line1\nline2", studentEmail: null }]);
  expect(csv).toContain('"Last, ""First"""');
  expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
  expect(csv).toContain('"line1\nline2"');
  expect(csv).not.toContain("undefined");
});
it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1)", "  =1+1", "\tformula", "\rformula", "\nformula"])("neutralizes dangerous cell prefixes (%j)", value => {
  expect(queueCSV([{ ...row, studentName: value }])).toContain('"\'' + value + '"');
});
it("validates the response owner/role and requests uncached data", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(queue));
  expect(await fetchAdminQueue(["/api/admin/requests", "staff_a", "employee"])).toEqual(queue);
  expect(fetch).toHaveBeenCalledWith("/api/admin/requests", expect.objectContaining({ cache: "no-store" }));
  vi.mocked(fetch).mockResolvedValue(Response.json({ ...queue, role: "admin" }));
  await expect(fetchAdminQueue(["/api/admin/requests", "staff_a", "employee"])).rejects.toMatchObject({ status: 403 });
  vi.mocked(fetch).mockResolvedValue(Response.json({ ...queue, actorId: "staff_b" }));
  await expect(fetchAdminQueue(["/api/admin/requests", "staff_a", "employee"])).rejects.toMatchObject({ status: 403 });
});
it.each([401, 403, 500])("rejects HTTP %s before using the response body", async status => {
  vi.mocked(fetch).mockResolvedValue(new Response("private failure", { status }));
  await expect(fetchAdminQueue(["/api/admin/requests", "staff_a", "employee"])).rejects.toMatchObject({ status });
});
it("rejects malformed data and followed login redirects", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ error: "not a queue" }));
  await expect(fetchAdminQueue(["/api/admin/requests", "staff_a", "employee"])).rejects.toMatchObject({ status: 502 });
  const redirected = Response.json(queue); Object.defineProperty(redirected, "redirected", { value: true });
  vi.mocked(fetch).mockResolvedValue(redirected);
  await expect(fetchAdminQueue(["/api/admin/requests", "staff_a", "employee"])).rejects.toMatchObject({ status: 401 });
});
