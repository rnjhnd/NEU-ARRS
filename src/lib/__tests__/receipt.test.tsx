import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import prisma from "@/lib/prisma";
import { getVerifiedActor } from "@/lib/auth";
import ReceiptPage from "@/app/(print)/receipt/[id]/page";
import type { Request, RequestMoney } from "@prisma/client";
import { moneyFixture } from "./money-fixture";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUser } }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_HTTP_ERROR_FALLBACK;404"); } }));
const render = async () => renderToStaticMarkup(await ReceiptPage({ params: Promise.resolve({ id: "request" }) }));
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("React", React);
  vi.mocked(getVerifiedActor).mockResolvedValue({ userId: "student", role: "student" });
  getUser.mockResolvedValue({ firstName: "Synthetic", lastName: "Student", publicMetadata: {}, emailAddresses: [{ emailAddress: "synthetic@example.invalid" }] });
  vi.mocked(prisma.documentConfig.findUnique).mockResolvedValue(null);
});
function paid(money: RequestMoney | null = moneyFixture()): Request & { money: RequestMoney | null } {
  return { id: "request", studentId: "student", studentName: "Synthetic Student", studentNumber: "22-12345-123", documentType: "TOR", purpose: "PERSONAL",
    status: "PROCESSING", paymentStatus: "PAID", paymentMethod: "online", amountPaid: 151, quotedAmountCentavos: 15050,
    paymongoPaymentId: "pay_original", paymongoCheckoutId: "cs_original", paymongoPaymentType: "gcash", submissionKey: null, notificationVersion: 0,
    cancelReason: null, createdAt: new Date("2026-11-01T00:00:00Z"), updatedAt: new Date("2026-11-11T00:00:00Z"), money };
}
it.each([0, 15050])("renders exact verified centavos %s without using rounded legacy money", async amount => {
  const row = paid(moneyFixture("request", { method: amount === 0 ? "cash" : "online", collectedCentavos: amount }));
  vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...row, paymentMethod: amount === 0 ? "cash" : "online", amountPaid: 99999 });
  const html = await render();
  expect(html).toContain(amount === 0 ? "₱0.00" : "₱150.50"); expect(html).not.toContain("99,999");
  expect(html).toContain("Not recorded"); expect(html).toContain("Collection verified:"); expect(html).toContain("Print Receipt");
});
it("blocks a receipt with no canonical collection even when legacy money and a quote exist", async () => {
  vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...paid(null), amountPaid: 15050, quotedAmountCentavos: 15050 });
  const html = await render(); expect(html).toContain("Receipt Amount Needs Verification"); expect(html).not.toContain("Print Receipt"); expect(getUser).not.toHaveBeenCalled();
});
it("denies another student's receipt before exposing its data", async () => {
  vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...paid(), studentId: "another_student" });
  await expect(render()).rejects.toThrow("404"); expect(getUser).not.toHaveBeenCalled();
});
it("allows an authenticated administrator and rejects an unpaid request", async () => {
  vi.mocked(getVerifiedActor).mockResolvedValue({ userId: "admin", role: "admin" }); getUser.mockResolvedValue({ firstName: "Synthetic", lastName: "Admin", publicMetadata: { role: "admin" }, emailAddresses: [] });
  vi.mocked(prisma.request.findUnique).mockResolvedValue(paid()); expect(await render()).toContain("₱150.50");
  vi.mocked(prisma.request.findUnique).mockResolvedValue({ ...paid(), paymentStatus: "UNPAID" }); expect(await render()).toContain("Receipt Not Available");
});
it("requires authentication before accessing the database", async () => {
  vi.mocked(getVerifiedActor).mockRejectedValue(new Error("Unauthorized")); await expect(render()).rejects.toThrow("Unauthorized"); expect(prisma.request.findUnique).not.toHaveBeenCalled();
});
