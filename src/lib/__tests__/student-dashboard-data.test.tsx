import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { requireStudent } from "@/lib/auth";
import { loadStudentHistory } from "@/lib/student-request-data";
import { getRequestSetting } from "@/lib/configuration-data";
import { DashboardData } from "@/app/(student)/dashboard/dashboard-data";

vi.mock("@/lib/student-request-data", () => ({ loadStudentHistory: vi.fn() }));
vi.mock("@/lib/configuration-data", () => ({ getRequestSetting: vi.fn() }));
vi.mock("@/app/(student)/dashboard/request-list", () => ({ RequestList: ({ isMaintenanceMode }: { isMaintenanceMode: boolean }) => React.createElement("p", {}, isMaintenanceMode ? "Requests paused" : "Requests available") }));
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("React", React); vi.mocked(requireStudent).mockResolvedValue("student"); });

it.each([true, false])("uses the page's verified maintenance result without a second setting read (%s)", async isMaintenanceMode => {
  const html = renderToStaticMarkup(await DashboardData({ userId: "student", isMaintenanceMode }));
  expect(html).toContain(isMaintenanceMode ? "Requests paused" : "Requests available");
  expect(loadStudentHistory).toHaveBeenCalledWith("student");
  expect(getRequestSetting).not.toHaveBeenCalled();
});
it("denies an account mismatch before loading history", async () => {
  await expect(DashboardData({ userId: "other", isMaintenanceMode: false })).rejects.toThrow("Account changed");
  expect(loadStudentHistory).not.toHaveBeenCalled();
});
