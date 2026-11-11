import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadFinanceData, financeSelect } from "@/lib/finance-data";
import prisma from "@/lib/prisma";
import type { Request as PrismaRequest } from "@prisma/client";
import { GET } from "../route";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
const row: PrismaRequest = { id: "request_a", studentId: "private", studentName: "Private Student", studentNumber: "private", documentType: "GOOD_MORAL", purpose: "PERSONAL", paymentMethod: "online", paymentStatus: "PAID", status: "PROCESSING", cancelReason: null,
  amountPaid: 99999, quotedAmountCentavos: 15050, paymongoPaymentId: "private", paymongoCheckoutId: "private", paymongoPaymentType: "card", submissionKey: "private", notificationVersion: 0,
  createdAt: new Date("2026-11-11T00:00:00.000Z"), updatedAt: new Date("2026-11-11T01:00:00.000Z") };
const joined = { ...row, money: { collectedCentavos: 15050, currency: "PHP", method: "online" } };
const call = (query = "period=7days") => GET(new Request("http://localhost/api/admin/finance?format=finance-v2&" + query));
beforeEach(() => { vi.resetAllMocks(); mockAuth.mockResolvedValue({ userId: "admin_a", sessionClaims: { metadata: { role: "admin" } } });
  vi.mocked(prisma.request.findMany).mockResolvedValue([joined]); vi.mocked(prisma.documentConfig.findMany).mockResolvedValue([]); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
it.each([[null, null, 401], ["employee_a", "employee", 403], ["student_a", "student", 403]])("requires administrator access before all queries (%s)", async (userId, role, status) => {
  mockAuth.mockResolvedValue({ userId, sessionClaims: { metadata: { role } } });
  const response = await call(); expect(response.status).toBe(status); expect(prisma.request.findMany).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("filters dates in the query, selects no PII/legacy values, and imposes a row sentinel", async () => {
  const result = await loadFinanceData({ period: "7days" }, prisma, new Date("2026-11-11T12:00:00Z"));
  expect(prisma.request.findMany).toHaveBeenCalledWith({ select: financeSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 5001,
    where: { createdAt: { gte: new Date("2026-11-04T16:00:00Z"), lt: new Date("2026-11-11T16:00:00Z"), lte: new Date("2026-11-11T12:00:00Z") } } });
  expect(result.items[0]).toMatchObject({ collectedCentavos: 15050, documentType: "Good Moral Certificate" });
  for (const key of ["studentId", "studentName", "studentNumber", "amountPaid", "paymongoPaymentId", "updatedAt", "submissionKey"]) expect(result.items[0]).not.toHaveProperty(key);
});
it("does not infer a value from legacy amounts or current document prices", async () => {
  vi.mocked(prisma.request.findMany).mockResolvedValue([{ ...row, quotedAmountCentavos: null, amountPaid: 15000 }]);
  vi.mocked(prisma.documentConfig.findMany).mockResolvedValue([{ id: "config", typeId: "GOOD_MORAL", label: "Configured", price: 99000, description: "Synthetic", isActive: true, createdAt: new Date(), updatedAt: new Date() }]);
  const data = await loadFinanceData(); expect(data.items[0]).toMatchObject({ collectedCentavos: null, documentType: "Configured" });
});
it("fails oversized reports rather than silently truncating totals", async () => {
  vi.mocked(prisma.request.findMany).mockResolvedValue(Array.from({ length: 5001 }, (_, i) => ({ ...row, id: String(i) })));
  const response = await call(); expect(response.status).toBe(413); expect(prisma.documentConfig.findMany).not.toHaveBeenCalled();
});
it.each(["period=custom", "period=custom&from=2026-02-30&to=2026-03-01", "period=bad", "period=all&period=7days"])("rejects invalid query controls (%s)", async query => {
  expect((await call(query)).status).toBe(400); expect(prisma.request.findMany).not.toHaveBeenCalled();
});
it("rejects future custom dates before database work", async () => {
  await expect(loadFinanceData({ period: "custom", from: "2027-01-01", to: "2027-01-02" }, prisma, new Date("2026-11-11"))).rejects.toMatchObject({ status: 400 });
  expect(prisma.request.findMany).not.toHaveBeenCalled();
});
it("uses private responses and sanitized database errors", async () => {
  const response = await call(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  vi.mocked(prisma.request.findMany).mockRejectedValue(new Error("private SQL detail"));
  const failed = await call(); expect(failed.status).toBe(500); expect(await failed.text()).not.toContain("private SQL detail");
});
it("asks obsolete clients to reload without fetching rows", async () => {
  const response = await GET(new Request("http://localhost/api/admin/finance")); expect(response.status).toBe(409); expect(prisma.request.findMany).not.toHaveBeenCalled();
});
