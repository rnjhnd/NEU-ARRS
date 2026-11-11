import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clerkClient } from "@clerk/nextjs/server";
import type { Request as PrismaRequest } from "@prisma/client";
import prisma from "@/lib/prisma";
import { adminQueueSelect, ADMIN_QUEUE_URL } from "@/lib/admin-queue-model";
import { GET } from "../route";

const { mockAuth, mockClient } = vi.hoisted(() => ({ mockAuth: vi.fn(), mockClient: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth, clerkClient: mockClient }));
const getUsers = vi.fn();
const row: PrismaRequest = { id: "cm0x2a3bc000008mia76m2p2g", studentId: "student_a", studentName: "Stored Student", studentNumber: "22-12345-123",
  documentType: "GOOD_MORAL", purpose: "PERSONAL", paymentMethod: "online", paymentStatus: "PAID", status: "PROCESSING", cancelReason: null,
  createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), amountPaid: 150, paymongoPaymentId: "pay_private", paymongoCheckoutId: "cs_private",
  paymongoPaymentType: "card", submissionKey: "private", quotedAmountCentavos: 15000, notificationVersion: 2 };
const call = (path = ADMIN_QUEUE_URL) => GET(new Request("http://localhost" + path));
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {});
  mockAuth.mockResolvedValue({ userId: "staff_a", sessionClaims: { metadata: { role: "employee" } } });
  vi.mocked(prisma.request.findMany).mockResolvedValue([row]);
  vi.mocked(prisma.documentConfig.findMany).mockResolvedValue([]);
  mockClient.mockResolvedValue({ users: { getUserList: getUsers } });
  getUsers.mockResolvedValue({ data: [{ id: "student_a", firstName: "Different", primaryEmailAddressId: "primary", emailAddresses: [
    { id: "other", emailAddress: "other@example.invalid" }, { id: "primary", emailAddress: "primary@example.invalid" },
  ] }], totalCount: 1 });
});
afterEach(() => vi.restoreAllMocks());

it.each([{ userId: null, sessionClaims: null, status: 401 }, { userId: "student", sessionClaims: { metadata: { role: "student" } }, status: 403 }])("rejects missing staff authorization before any query ($status)", async ({ status, ...actor }) => {
  mockAuth.mockResolvedValue(actor);
  const response = await call(); expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(prisma.request.findMany).not.toHaveBeenCalled(); expect(getUsers).not.toHaveBeenCalled();
});
it.each(["admin", "employee"] as const)("returns consistent projected identity data for %s", async role => {
  mockAuth.mockResolvedValue({ userId: "staff_a", sessionClaims: { metadata: { role } } });
  const response = await call(); expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const queue = await response.json(); expect(queue).toMatchObject({ actorId: "staff_a", role, emailLookupFailed: false });
  expect(queue.items[0]).toMatchObject({ studentName: "Stored Student", studentEmail: "primary@example.invalid", documentType: "Good Moral Certificate", updatedAt: "2026-01-02T00:00:00.000Z" });
  for (const key of ["studentId", "paymongoPaymentId", "paymongoCheckoutId", "submissionKey", "quotedAmountCentavos", "amountPaid", "notificationVersion"]) expect(queue.items[0]).not.toHaveProperty(key);
  expect(prisma.request.findMany).toHaveBeenCalledWith({ orderBy: [{ updatedAt: "desc" }, { id: "asc" }], select: adminQueueSelect });
  expect(getUsers).toHaveBeenCalledWith({ userId: ["student_a"], limit: 100 });
});
it("looks up all represented accounts in bounded batches instead of accepting the default directory page", async () => {
  vi.mocked(prisma.request.findMany).mockResolvedValue(Array.from({ length: 205 }, (_, i) => ({ ...row, id: "request_" + i, studentId: "student_" + i })));
  getUsers.mockImplementation(async ({ userId }: { userId: string[] }) => ({ data: userId.map(id => ({ id, primaryEmailAddressId: "primary", emailAddresses: [{ id: "primary", emailAddress: id + "@example.invalid" }] })) }));
  const response = await call(); const queue = await response.json();
  expect(getUsers).toHaveBeenCalledTimes(3);
  expect(getUsers.mock.calls.map(([query]) => query.userId.length)).toEqual([100, 100, 5]);
  expect(queue.items[204].studentEmail).toBe("student_204@example.invalid");
});
it("preserves the usable queue with explicit email degradation when Clerk fails", async () => {
  getUsers.mockRejectedValue(new Error("Synthetic outage"));
  const response = await call(); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ emailLookupFailed: true, items: [expect.objectContaining({ studentName: "Stored Student", studentEmail: null })] });
});
it("does not replace a missing primary email with another address or read unrelated accounts", async () => {
  getUsers.mockResolvedValue({ data: [{ id: "student_a", primaryEmailAddressId: "missing", emailAddresses: [{ id: "other", emailAddress: "wrong@example.invalid" }] },
    { id: "unrelated", primaryEmailAddressId: "x", emailAddresses: [{ id: "x", emailAddress: "private@example.invalid" }] }] });
  const data = await (await call()).json(); expect(data.items[0].studentEmail).toBeNull(); expect(JSON.stringify(data)).not.toContain("private@example.invalid");
});
it("does not access Clerk for an empty queue", async () => {
  vi.mocked(prisma.request.findMany).mockResolvedValue([]);
  expect((await call()).status).toBe(200); expect(clerkClient).not.toHaveBeenCalled();
});
it("returns a private 500 on database failure instead of a fake empty queue", async () => {
  vi.mocked(prisma.request.findMany).mockRejectedValue(new Error("private database detail"));
  const response = await call(); expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.text()).not.toContain("private database detail");
});
it("rejects the legacy format after authentication without querying the queue", async () => {
  const response = await call("/api/admin/requests"); expect(response.status).toBe(409);
  expect(prisma.request.findMany).not.toHaveBeenCalled();
});
