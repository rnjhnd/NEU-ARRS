import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { requireStudent } from "@/lib/auth";
import Page from "@/app/(student)/dashboard/page";
import { getRequestSetting } from "@/lib/configuration-data";
const { currentUser, clerkClient } = vi.hoisted(() => ({ currentUser: vi.fn(), clerkClient: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser, clerkClient }));
vi.mock("@/lib/configuration-data", () => ({ getRequestSetting: vi.fn() }));
vi.mock("@/app/(student)/dashboard/dashboard-data", () => ({ DashboardData: () => React.createElement("p", {}, "Synthetic history") }));
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("React", React); vi.mocked(requireStudent).mockResolvedValue("student"); currentUser.mockResolvedValue({ firstName: "Synthetic" }); vi.mocked(getRequestSetting).mockResolvedValue({ success: true, value: "false" }); });
it("never initializes or overwrites a role during dashboard rendering", async () => {
  expect(renderToStaticMarkup(await Page())).toContain("Welcome back"); expect(clerkClient).not.toHaveBeenCalled(); expect(requireStudent).toHaveBeenCalledBefore(currentUser);
});
it("denies staff/signed-out access before profile/settings calls", async () => {
  vi.mocked(requireStudent).mockRejectedValue(new Error("Forbidden")); await expect(Page()).rejects.toThrow("Forbidden"); expect(currentUser).not.toHaveBeenCalled(); expect(getRequestSetting).not.toHaveBeenCalled();
});
it("disables the new request link when availability verification fails", async () => {
  vi.mocked(getRequestSetting).mockResolvedValue({ success: false, value: null, error: "Unavailable" }); const html = renderToStaticMarkup(await Page()); expect(html).not.toContain('href="/dashboard/new"'); expect(html).toContain("Synthetic history");
});
