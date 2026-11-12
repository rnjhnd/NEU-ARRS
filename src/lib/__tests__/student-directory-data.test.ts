import { afterEach, beforeEach, expect, it, vi } from "vitest";
import prisma from "@/lib/prisma";
import { loadStudentDirectory, type DirectoryProvider } from "../student-directory-data";
import { GET } from "@/app/api/admin/students/route";

vi.mock("@/lib/auth", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getVerifiedActor: async () => {
    const fixture = await mockAuth();
    if (!fixture?.userId) throw new actual.AccessError(401);
    return { userId: fixture.userId, role: fixture.sessionClaims?.metadata?.role };
  } };
});
const { mockAuth, getUserList } = vi.hoisted(() => ({ mockAuth: vi.fn(), getUserList: vi.fn<DirectoryProvider["getUserList"]>() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth, clerkClient: async () => ({ users: { getUserList } }) }));
function user(id: string, role: unknown = "student") {
  return { id, firstName: "Synthetic", lastName: id, imageUrl: "https://img.clerk.com/synthetic", publicMetadata: { role }, primaryEmailAddressId: "primary",
    emailAddresses: [{ id: "secondary", emailAddress: "secondary@example.invalid" }, { id: "primary", emailAddress: "primary@example.invalid" }], privateMetadata: { neverSerialize: "private" } };
}
const call = (query = "format=directory-v1") => GET(new Request("http://localhost/api/admin/students?" + query));
beforeEach(() => {
  vi.resetAllMocks(); mockAuth.mockResolvedValue({ userId: "staff", sessionClaims: { metadata: { role: "employee" } } });
  getUserList.mockResolvedValue({ data: [user("student")], totalCount: 1 }); vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it.each([[null, undefined, 401], ["student", "student", 403], ["unknown", "owner", 403]])("requires staff before provider or database access (%s)", async (userId, role, status) => {
  mockAuth.mockResolvedValue({ userId, sessionClaims: { metadata: { role } } });
  expect((await call()).status).toBe(status);
  await expect(loadStudentDirectory()).rejects.toMatchObject({ status });
  expect(getUserList).not.toHaveBeenCalled(); expect(prisma.$queryRaw).not.toHaveBeenCalled();
});
it.each(["admin", "employee"])("allows %s and projects primary contact/counts without private data", async role => {
  mockAuth.mockResolvedValue({ userId: "staff", sessionClaims: { metadata: { role } } });
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ studentId: "student", requestCount: BigInt(3), collectedCentavos: BigInt(15050), unverifiedCount: BigInt(1) }]);
  const response = await call(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  const directory = await response.json(); expect(directory.totals).toEqual({ students: 1, requests: 3, collectedCentavos: 15050, unverified: 1 });
  expect(directory.items[0]).toEqual({ id: "student", name: "Synthetic student", email: "primary@example.invalid", imageUrl: "https://img.clerk.com/synthetic", requestCount: 3, collectedCentavos: 15050, unverifiedCount: 1 });
  expect(JSON.stringify(directory)).not.toContain("private"); expect(prisma.request.findMany).not.toHaveBeenCalled();
});
it("paginates beyond 100 and 500 accounts, excludes staff/unknown roles, and scopes one grouped query", async () => {
  const users: Awaited<ReturnType<DirectoryProvider["getUserList"]>>["data"] = Array.from({ length: 505 }, (_, i) => user("student_" + i));
  users[0] = user("staff_admin", "admin"); users[1] = user("staff_employee", "employee"); users[2] = user("unknown_role", "owner"); users[3] = { ...user("legacy"), publicMetadata: {} };
  users[4] = { ...user("no_primary"), primaryEmailAddressId: null, imageUrl: "data:unsafe" };
  getUserList.mockImplementation(async ({ offset, limit }) => ({ data: users.slice(offset, offset + limit), totalCount: users.length }));
  const result = await loadStudentDirectory(); expect(result.items).toHaveLength(502); expect(result.items.at(-1)?.id).toBe("student_504");
  expect(result.items.find(item => item.id === "no_primary")).toMatchObject({ email: null, imageUrl: null });
  expect(getUserList).toHaveBeenNthCalledWith(1, { offset: 0, limit: 500, orderBy: "+created_at" });
  expect(getUserList).toHaveBeenNthCalledWith(2, { offset: 500, limit: 500, orderBy: "+created_at" });
  expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  const sql = vi.mocked(prisma.$queryRaw).mock.calls[0][0] as { values: unknown[]; sql: string };
  expect(sql.values).not.toContain("staff_admin"); expect(sql.values).not.toContain("unknown_role"); expect(sql.values).toContain("student_504"); expect(sql.sql).not.toContain("amountPaid");
});
it("handles an empty/all-staff registry without querying requests or inventing students", async () => {
  for (const users of [[], [user("staff", "employee")]]) {
    getUserList.mockResolvedValue({ data: users, totalCount: users.length });
    expect((await loadStudentDirectory()).totals).toEqual({ students: 0, requests: 0, collectedCentavos: 0, unverified: 0 });
  }
  expect(prisma.$queryRaw).not.toHaveBeenCalled();
});
it("refuses oversized accounts before querying the database", async () => {
  getUserList.mockResolvedValue({ data: [], totalCount: 5001 });
  expect((await call()).status).toBe(413); expect(prisma.$queryRaw).not.toHaveBeenCalled();
});
it("accepts the exact account boundary without silently truncating its last provider page", async () => {
  getUserList.mockImplementation(async ({ offset, limit }) => ({ data: Array.from({ length: limit }, (_, i) => user("boundary_" + (offset + i))), totalCount: 5000 }));
  const directory = await loadStudentDirectory(); expect(directory.items).toHaveLength(5000); expect(directory.items.at(-1)?.id).toBe("boundary_4999");
  expect(getUserList).toHaveBeenCalledTimes(10); expect(prisma.$queryRaw).toHaveBeenCalledOnce();
});
it("rejects an oversized response payload instead of sending an incomplete directory", async () => {
  getUserList.mockImplementation(async ({ offset, limit }) => ({ data: Array.from({ length: limit }, (_, i) => ({ ...user("large_" + (offset + i)), firstName: "A".repeat(500), lastName: "", imageUrl: "https://img.clerk.com/" + "a".repeat(2000) })), totalCount: 1000 }));
  expect((await call()).status).toBe(413);
});
it("refuses a provider scan that has exceeded its elapsed-time budget", async () => {
  vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(20001);
  expect((await call()).status).toBe(503); expect(prisma.$queryRaw).not.toHaveBeenCalled();
});
it("refuses short pages, duplicate IDs and inconsistent provider totals", async () => {
  for (const result of [{ data: [], totalCount: 2 }, { data: [user("same"), user("same")], totalCount: 2 }, { data: [], totalCount: -1 }]) {
    getUserList.mockResolvedValue(result); expect((await call()).status).toBe(503);
  }
  const first = Array.from({ length: 500 }, (_, i) => user(String(i)));
  getUserList.mockResolvedValueOnce({ data: first, totalCount: 501 }).mockResolvedValueOnce({ data: [user("last")], totalCount: 502 });
  expect((await call()).status).toBe(503); expect(prisma.$queryRaw).not.toHaveBeenCalled();
});
it("fails rather than rounding unsafe aggregate totals or accepting unexpected students", async () => {
  for (const row of [{ studentId: "student", requestCount: BigInt(1), collectedCentavos: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1), unverifiedCount: BigInt(0) },
    { studentId: "another_student", requestCount: BigInt(1), collectedCentavos: BigInt(0), unverifiedCount: BigInt(0) }]) {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([row]); expect((await call()).status).toBe(503);
  }
});
it.each([["", 409], ["format=old", 409], ["format=directory-v1&format=directory-v1", 400], ["format=directory-v1&studentId=forged", 400]])("rejects obsolete/forged query controls (%s)", async (query, status) => {
  expect((await call(query)).status).toBe(status); expect(getUserList).not.toHaveBeenCalled(); expect(prisma.$queryRaw).not.toHaveBeenCalled();
});
it("sanitizes provider/database failures and marks every response private", async () => {
  getUserList.mockRejectedValueOnce(new Error("secret provider response"));
  let failed = await call(); expect(failed.status).toBe(500); expect(await failed.text()).not.toContain("secret");
  vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("private SQL details"));
  failed = await call(); expect(failed.status).toBe(500); expect(await failed.text()).not.toContain("private SQL"); expect(failed.headers.get("cache-control")).toBe("private, no-store");
});
