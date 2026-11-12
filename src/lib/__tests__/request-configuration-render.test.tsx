import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { requireStudent as requireAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Page from "@/app/(student)/dashboard/new/page";

vi.mock("@/app/(student)/dashboard/new/request-form", () => ({ RequestForm: ({ documentConfigs, paymentMethods }: { documentConfigs: { typeId: string; price: number }[]; paymentMethods: { online: boolean; cash: boolean } }) => React.createElement("p", { "data-testid": "request-form" }, JSON.stringify({ documentConfigs, paymentMethods })) }));
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("React", React); vi.mocked(requireAuth).mockResolvedValue("synthetic_student"); vi.mocked(prisma.systemSettings.findUnique).mockResolvedValue(null); vi.mocked(prisma.documentConfig.findMany).mockResolvedValue([]); });
afterEach(() => vi.unstubAllGlobals());
it("shows an empty catalog without seeding documents or displaying an unusable form", async () => {
  const html = renderToStaticMarkup(await Page()); expect(html).toContain("No documents available"); expect(html).not.toContain("data-testid"); expect(prisma.documentConfig.createMany).not.toHaveBeenCalled();
});
it("blocks malformed maintenance/payment settings instead of displaying a permissive form", async () => {
  vi.mocked(prisma.systemSettings.findUnique).mockResolvedValue({ id: "malformed", key: "MAINTENANCE_MODE", value: "malformed", updatedAt: new Date() });
  const html = renderToStaticMarkup(await Page()); expect(html).toContain("Request settings unavailable"); expect(html).not.toContain("data-testid");
});
it("keeps history available during maintenance and avoids querying the catalog", async () => {
  vi.mocked(prisma.systemSettings.findUnique).mockResolvedValue({ id: "paused", key: "MAINTENANCE_MODE", value: "true", updatedAt: new Date() });
  const html = renderToStaticMarkup(await Page()); expect(html).toContain("New requests paused"); expect(html).toContain("history remains available"); expect(prisma.documentConfig.findMany).not.toHaveBeenCalled();
});
it("does not query settings or catalog for unauthenticated requests", async () => {
  vi.mocked(requireAuth).mockRejectedValue(new Error("Unauthorized"));
  expect(renderToStaticMarkup(await Page())).not.toContain("data-testid"); expect(prisma.systemSettings.findUnique).not.toHaveBeenCalled(); expect(prisma.documentConfig.findMany).not.toHaveBeenCalled();
});
