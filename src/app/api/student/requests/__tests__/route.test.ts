import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { currentUser } from "@clerk/nextjs/server";
import type { Request as PrismaRequest } from "@prisma/client";
import prisma from "@/lib/prisma";
import { STUDENT_HISTORY_URL } from "@/lib/student-request-model";
import { GET } from "../route";

vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
const historyRequest = () => new Request("http://localhost" + STUDENT_HISTORY_URL + "&studentId=user_other");
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it("rejects signed-out callers before accessing requests", async () => {
  vi.mocked(currentUser).mockResolvedValue(null);
  const response = await GET(historyRequest());
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.$queryRaw).not.toHaveBeenCalled();
});
it("scopes the query to the authenticated owner and returns only display data", async () => {
  vi.mocked(currentUser, { partial: true }).mockResolvedValue({ id: "user_student123" });
  const row: PrismaRequest = { id: "cm0x2a3bc000008mia76m2p2g", studentId: "user_student123", studentName: "Synthetic Student", studentNumber: "22-12345-123",
    documentType: "TOR", purpose: "PERSONAL", status: "PENDING_PAYMENT", paymentMethod: "online", paymentStatus: "UNPAID",
    amountPaid: null, cancelReason: null, paymongoPaymentId: "pay_private", paymongoCheckoutId: "cs_private", paymongoPaymentType: null,
    createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), submissionKey: "private", quotedAmountCentavos: 15050, notificationVersion: 0 };
  vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ total: 1, active: 1, completed: 0 }]).mockResolvedValueOnce([row]);
  const response = await GET(historyRequest());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const queries = vi.mocked(prisma.$queryRaw).mock.calls.map(call => call[0]);
  expect(queries).toHaveLength(2);
  for (const query of queries) expect(query).toMatchObject({ values: expect.arrayContaining(["user_student123"]) });
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead", timeout: 10000 });
  const data = await response.json();
  expect(data.studentId).toBe("user_student123");
  expect(data.items[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
  expect(data.items[0]).not.toHaveProperty("paymongoPaymentId");
  expect(data.items[0]).not.toHaveProperty("studentNumber");
  expect(data.items[0]).not.toHaveProperty("submissionKey");
  expect(data.items[0]).not.toHaveProperty("studentName");
  expect(data.items[0]).not.toHaveProperty("quotedAmountCentavos");
});
it.each(["", "?format=history-v1"])("requires older tabs to refresh without loading an unbounded history (%s)", async suffix => {
  vi.mocked(currentUser, { partial: true }).mockResolvedValue({ id: "user_student123" });
  const response = await GET(new Request("http://localhost/api/student/requests" + suffix));
  expect(response.status).toBe(409);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toHaveProperty("error");
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it.each(["page=0", "page=-1", "page=1.5", "page=100001", "page=1e3", "page=", "sort=studentId", "direction=asc%3BSELECT", "page=1&page=2", "sort=id&sort=status"])("rejects invalid pagination before querying (%s)", async query => {
  vi.mocked(currentUser, { partial: true }).mockResolvedValue({ id: "user_student123" });
  const response = await GET(new Request("http://localhost" + STUDENT_HISTORY_URL + "&" + query));
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("returns a non-cacheable failure rather than a fake empty history", async () => {
  vi.mocked(currentUser, { partial: true }).mockResolvedValue({ id: "user_student123" });
  vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("Synthetic outage"));
  const response = await GET(historyRequest());
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
