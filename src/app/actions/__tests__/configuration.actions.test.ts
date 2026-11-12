import { afterEach, beforeEach, expect, it, vi } from "vitest";
import prisma from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/auth";
import { createDocumentConfig, initializeDocumentDefaults, updateDocumentConfig, updateSystemSetting } from "../configuration.actions";
import { getSystemSetting, updateUserRole } from "../admin.actions";
import { loadAdminDocuments, loadAdminSettings, loadStudentCatalog } from "@/lib/configuration-data";
import { GET } from "@/app/api/admin/configuration/route";
import type { DocumentConfig } from "@prisma/client";
import { revalidatePath } from "next/cache";

const { getUser, getUserList, updateUserMetadata, getSessionList, revokeSession } = vi.hoisted(() => ({ getUser: vi.fn(), getUserList: vi.fn(), updateUserMetadata: vi.fn(), getSessionList: vi.fn(), revokeSession: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUser, getUserList, updateUserMetadata }, sessions: { getSessionList, revokeSession } }) }));
const record: DocumentConfig = { id: "config", typeId: "TOR", label: "Transcript", description: "Official record", price: 15050, isActive: true, createdAt: new Date("2026-11-01T00:00:00Z"), updatedAt: new Date("2026-11-12T00:00:00Z") };
function docForm(update = false, overrides: Record<string, string> = {}) {
  const form = new FormData();
  Object.entries({ label: "New document", description: "Official document", price: "150.50", isActive: "true",
    ...(update ? { id: record.id, expectedVersion: record.updatedAt.toISOString() } : { intentId: "9d23e101-9e88-42e7-9ca5-b6c5fc65fabc", typeId: "NEW_DOCUMENT" }), ...overrides }).forEach(([key, value]) => form.set(key, value));
  return form;
}
function settingForm(key = "PAYMENT_METHODS", value = '{"online":true,"cash":false}', expectedVersion = "") {
  const form = new FormData(); form.set("key", key); form.set("value", value); form.set("expectedVersion", expectedVersion); return form;
}
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(requireAdmin).mockResolvedValue("admin"); vi.mocked(requireAuth).mockResolvedValue("student");
  vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma));
  vi.mocked(prisma.documentConfig.findUnique).mockResolvedValue(null); vi.mocked(prisma.documentConfig.count).mockResolvedValue(0); vi.mocked(prisma.documentConfig.findMany).mockResolvedValue([]);
  vi.mocked(prisma.documentConfig.create).mockResolvedValue(record);
  vi.mocked(prisma.systemSettings.findUnique).mockResolvedValue(null); vi.mocked(prisma.systemSettings.findMany).mockResolvedValue([]);
  vi.mocked(prisma.systemSettings.create).mockResolvedValue({ id: "setting", key: "PAYMENT_METHODS", value: '{"online":true,"cash":false}', updatedAt: new Date("2026-11-12T00:00:00Z") });
  getSessionList.mockResolvedValue({ data: [] }); getUser.mockResolvedValue({ publicMetadata: { role: "student" } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it.each(["Unauthorized", "Forbidden"])("rejects all configuration writes/reads before IO (%s)", async message => {
  vi.mocked(requireAdmin).mockRejectedValue(new Error(message));
  for (const result of [await createDocumentConfig(docForm()), await updateDocumentConfig(docForm(true)), await updateSystemSetting(settingForm()), await initializeDocumentDefaults()]) expect(result).toMatchObject({ success: false, code: "auth" });
  await expect(loadAdminDocuments()).rejects.toThrow(message); await expect(loadAdminSettings()).rejects.toThrow(message);
  expect(prisma.$transaction).not.toHaveBeenCalled(); expect(prisma.documentConfig.findMany).not.toHaveBeenCalled(); expect(prisma.systemSettings.findMany).not.toHaveBeenCalled();
  const response = await GET(new Request("http://localhost/api/admin/configuration?format=config-v1&area=settings")); expect([401, 403]).toContain(response.status);
});
it("creates exact authoritative centavos and ignores no forged/duplicated fields", async () => {
  const result = await createDocumentConfig(docForm()); expect(result).toMatchObject({ success: true, data: { price: 15050 } });
  expect(prisma.documentConfig.create).toHaveBeenCalledWith({ data: expect.objectContaining({ price: 15050, isActive: true }) });
  const duplicate = docForm(); duplicate.append("price", "1"); expect(await createDocumentConfig(duplicate)).toMatchObject({ success: false, code: "invalid" });
  const forged = docForm(false, { actorId: "forged" }); expect(await createDocumentConfig(forged)).toMatchObject({ success: false, code: "invalid" });
  const file = docForm(); file.set("price", new File(["150"], "price.txt")); expect(await createDocumentConfig(file)).toMatchObject({ success: false, code: "invalid" });
});
it.each(["-1", "150.501", "1e2", "21474836.48", ""])("rejects invalid prices before transactions (%s)", async price => {
  expect(await createDocumentConfig(docForm(false, { price }))).toMatchObject({ success: false, code: "invalid" }); expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("rejects stale document edits and cannot change a historical document code", async () => {
  vi.mocked(prisma.documentConfig.findUnique).mockResolvedValue(record);
  expect(await updateDocumentConfig(docForm(true, { expectedVersion: "2020-01-01T00:00:00Z" }))).toMatchObject({ success: false, code: "conflict" });
  expect(await updateDocumentConfig(docForm(true, { typeId: "REPLACEMENT" }))).toMatchObject({ success: false, code: "invalid" });
  expect(prisma.documentConfig.update).not.toHaveBeenCalled();
});
it("reports a confirmed save even if cache invalidation fails after commit", async () => {
  vi.mocked(revalidatePath).mockImplementation(() => { throw new Error("synthetic cache failure"); });
  expect(await createDocumentConfig(docForm())).toMatchObject({ success: true, data: { price: 15050 } });
});
it.each([["UNSUPPORTED", "{}"], ["PAYMENT_METHODS", '{"online":false,"cash":false}'], ["MAINTENANCE_MODE", '"true"'], ["OPERATIONS_CONFIG", "malformed"]])("rejects invalid setting %s before writes", async (key, value) => {
  expect(await updateSystemSetting(settingForm(key, value))).toMatchObject({ success: false, code: "invalid" }); expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("makes public setting reads authenticated and limits them to request-availability controls", async () => {
  vi.mocked(requireAuth).mockRejectedValueOnce(new Error("Unauthorized")); expect(await getSystemSetting("MAINTENANCE_MODE")).toMatchObject({ success: false });
  expect(await getSystemSetting("EMAIL_TEMPLATES")).toMatchObject({ success: false });
  expect(await getSystemSetting("API_SECRET")).toMatchObject({ success: false }); expect(prisma.systemSettings.findUnique).not.toHaveBeenCalled();
  expect(await getSystemSetting("MAINTENANCE_MODE")).toEqual({ success: true, value: "false" });
});
it("never seeds a catalog during reads and exposes only active catalog fields to students", async () => {
  expect(await loadStudentCatalog()).toEqual([]); expect(await loadAdminDocuments()).toMatchObject({ items: [] });
  expect(prisma.documentConfig.createMany).not.toHaveBeenCalled(); expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.documentConfig.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true }, select: expect.objectContaining({ typeId: true, price: true }) }));
});
it("rejects unsafe setting reader failures without leaking stored/SQL data", async () => {
  vi.mocked(prisma.systemSettings.findUnique).mockRejectedValue(new Error("private connection details"));
  expect(JSON.stringify(await getSystemSetting("MAINTENANCE_MODE"))).not.toContain("private");
});
it("rejects oversized complete catalog responses explicitly", async () => {
  vi.mocked(prisma.documentConfig.findMany).mockResolvedValue(Array.from({ length: 1000 }, (_, i) => ({ ...record, id: "config_" + i, typeId: "CODE_" + i, description: "文".repeat(2000) })));
  const response = await GET(new Request("http://localhost/api/admin/configuration?format=config-v1&area=documents")); expect(response.status).toBe(413);
});
it.each(["", "format=old&area=settings", "format=config-v1&area=secret", "format=config-v1&area=settings&key=API_SECRET", "format=config-v1&area=settings&area=roles"])("rejects obsolete/forged API controls (%s)", async query => {
  const response = await GET(new Request("http://localhost/api/admin/configuration?" + query)); expect([400, 409]).toContain(response.status); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(prisma.systemSettings.findMany).not.toHaveBeenCalled(); expect(getUserList).not.toHaveBeenCalled();
});
it("validates roles at runtime and rejects stale/self role changes without provider writes", async () => {
  expect(await updateUserRole("target", "owner" as "admin", "student", "c8d27620-6311-423a-a369-000000000001")).toMatchObject({ success: false, code: "invalid" });
  expect(await updateUserRole("admin", "student", "admin", "c8d27620-6311-423a-a369-000000000001")).toMatchObject({ success: false, code: "invalid" });
  expect(await updateUserRole("target", "admin", "student", "invalid-intent")).toMatchObject({ success: false, code: "invalid" });
  expect(updateUserMetadata).not.toHaveBeenCalled();
});
