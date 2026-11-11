import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_DIRECTORY_SORT, DIRECTORY_URL, directorySchema, directoryTotals, directoryView, type DirectoryStudent, type StudentDirectory } from "../student-directory-model";
import { fetchStudentDirectory } from "../student-directory-fetcher";

const student: DirectoryStudent = { id: "student_a", name: "Synthetic Student", email: "primary@example.invalid", imageUrl: null, requestCount: 3, collectedCentavos: 15050, unverifiedCount: 1 };
const snapshot = (items = [student]): StudentDirectory => ({ actorId: "staff", role: "employee", asOf: "2026-11-11T00:00:00Z", items, totals: directoryTotals(items) });
beforeEach(() => vi.resetAllMocks());
it("searches names and primary emails without mutating the source and clamps shrinking/empty pages", () => {
  const items = Array.from({ length: 24 }, (_, i) => ({ ...student, id: String(i), name: "Student " + i }));
  const original = items.map(item => item.id);
  expect(directoryView(items, "", DEFAULT_DIRECTORY_SORT, 9)).toMatchObject({ page: 3, totalPages: 3, start: 21, end: 24 });
  expect(directoryView(items.slice(0, 2), "", DEFAULT_DIRECTORY_SORT, 3)).toMatchObject({ page: 1, totalPages: 1 });
  expect(directoryView(items, "missing", DEFAULT_DIRECTORY_SORT, 9)).toMatchObject({ page: 1, totalPages: 1, start: 0, end: 0, matched: 0, items: [] });
  expect(directoryView(items, " STUDENT 22 ", DEFAULT_DIRECTORY_SORT, 3).items[0].id).toBe("22");
  expect(directoryView(items, "PRIMARY@", DEFAULT_DIRECTORY_SORT, 1).matched).toBe(24);
  expect(items.map(item => item.id)).toEqual(original);
});
it.each(["name", "email", "requestCount", "collectedCentavos"] as const)("sorts %s globally with stable ID ties and exact centavos", key => {
  const a = { ...student, id: "b", name: "A", email: null, requestCount: 1, collectedCentavos: 0 };
  const b = { ...student, id: "a", name: "B", email: "b@example.invalid", requestCount: 2, collectedCentavos: 15050 };
  expect(directoryView([b, a], "", { key, direction: "asc" }, 1).items.map(item => item.id)).toEqual(["b", "a"]);
  expect(directoryView([b, a], "", { key, direction: "desc" }, 1).items.map(item => item.id)).toEqual(["a", "b"]);
  expect(directoryView([{ ...student, id: "b" }, { ...student, id: "a" }], "", { key, direction: "desc" }, 1).items.map(item => item.id)).toEqual(["a", "b"]);
});
it("validates a complete directory including zero collections and rejects inconsistent/private payloads", () => {
  const valid = snapshot([{ ...student, collectedCentavos: 0 }]); expect(directorySchema.parse(valid)).toEqual(valid);
  expect(directorySchema.safeParse({ ...valid, totals: { ...valid.totals, collectedCentavos: 15050 } }).success).toBe(false);
  expect(directorySchema.safeParse(snapshot([student, student])).success).toBe(false);
  expect(directorySchema.safeParse(snapshot([{ ...student, requestCount: 0 }])).success).toBe(false);
  expect(directorySchema.safeParse(snapshot([{ ...student, imageUrl: "javascript:alert(1)" }])).success).toBe(false);
  expect(directorySchema.safeParse({ ...valid, items: [{ ...valid.items[0], privateMetadata: {} }] }).success).toBe(false);
});
it("refreshes only matching actor/role snapshots using private fetch semantics", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(snapshot()));
  expect(await fetchStudentDirectory([DIRECTORY_URL, "staff", "employee"])).toEqual(snapshot());
  expect(fetch).toHaveBeenCalledWith(DIRECTORY_URL, expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
});
it.each([401, 403, 404, 413, 503])("rejects HTTP %s without accepting a successful-looking body", async status => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(snapshot(), { status }));
  await expect(fetchStudentDirectory([DIRECTORY_URL, "staff", "employee"])).rejects.toMatchObject({ status });
});
it("rejects redirects, malformed bodies, duplicates and actor/role changes", async () => {
  const redirected = Response.json(snapshot()); Object.defineProperty(redirected, "redirected", { value: true });
  vi.mocked(fetch).mockResolvedValueOnce(redirected);
  await expect(fetchStudentDirectory([DIRECTORY_URL, "staff", "employee"])).rejects.toMatchObject({ status: 401 });
  for (const body of [{}, snapshot([student, student]), { ...snapshot(), actorId: "other" }, { ...snapshot(), role: "admin" }]) {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body));
    await expect(fetchStudentDirectory([DIRECTORY_URL, "staff", "employee"])).rejects.toThrow();
  }
});
