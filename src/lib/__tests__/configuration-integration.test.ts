import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import prisma from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/auth";
import { createDocumentConfig, initializeDocumentDefaults, updateDocumentConfig, updateSystemSetting } from "@/app/actions/configuration.actions";
import { loadAdminDocuments, loadAdminSettings, loadStudentCatalog } from "../configuration-data";
import { enqueueRequestNotification } from "../notification-content";

let db: PGlite, socket: PGLiteSocketServer, client: PrismaClient, failAudit = false;
let sequence = 1;
const version = new Date("2026-11-12T00:00:00Z");
beforeAll(async () => {
  db = await PGlite.create(); const root = resolve(process.cwd(), "prisma/migrations");
  for (const entry of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(await readFile(resolve(root, entry.name, "migration.sql"), "utf8"));
  socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 3 }); await socket.start();
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable`, max: 2 }) });
}, 60000);
afterAll(async () => { await client?.$disconnect(); await socket?.stop(); await db?.close(); });
beforeEach(async () => {
  vi.resetAllMocks(); failAudit = false;
  vi.mocked(requireAdmin).mockResolvedValue("synthetic_admin"); vi.mocked(requireAuth).mockResolvedValue("synthetic_student"); vi.spyOn(console, "error").mockImplementation(() => {});
  await client.auditLog.deleteMany(); await client.notificationOutbox.deleteMany(); await client.request.deleteMany(); await client.documentConfig.deleteMany(); await client.systemSettings.deleteMany();
  vi.mocked(prisma.$transaction).mockImplementation(async (callback, options) => client.$transaction(async tx => callback(new Proxy(tx, { get(target, key) {
    if (key === "auditLog" && failAudit) return new Proxy(target.auditLog, { get(audit, method) { return method === "create" ? async () => { throw new Error("synthetic audit failure"); } : Reflect.get(audit, method); } });
    return Reflect.get(target, key);
  } }) as Prisma.TransactionClient), options));
  vi.mocked(prisma.documentConfig.findMany).mockImplementation(client.documentConfig.findMany.bind(client.documentConfig));
  vi.mocked(prisma.systemSettings.findMany).mockImplementation(client.systemSettings.findMany.bind(client.systemSettings));
  vi.mocked(prisma.systemSettings.findUnique).mockImplementation(client.systemSettings.findUnique.bind(client.systemSettings));
});
afterEach(() => vi.restoreAllMocks());
function docForm(update?: { id: string; updatedAt: Date }, changes: Record<string, string> = {}) {
  const form = new FormData(); Object.entries({ label: "Synthetic document", description: "Synthetic official document", price: "150.50", isActive: "true",
    ...(update ? { id: update.id, expectedVersion: update.updatedAt.toISOString() } : { intentId: "c8d27620-6311-423a-a369-" + String(sequence++).padStart(12, "0"), typeId: "SYNTHETIC" }), ...changes }).forEach(([key, value]) => form.set(key, value)); return form;
}
function settingForm(key: string, value: string, updatedAt: Date | null = null) { const form = new FormData(); form.set("key", key); form.set("value", value); form.set("expectedVersion", updatedAt?.toISOString() ?? ""); return form; }
it("does not write on empty reads and initializes standards only after an explicit audited action", async () => {
  expect((await loadAdminDocuments()).items).toEqual([]); expect(await loadStudentCatalog()).toEqual([]); expect(await client.documentConfig.count()).toBe(0); expect(await client.auditLog.count()).toBe(0);
  expect(await initializeDocumentDefaults()).toMatchObject({ success: true, data: 4 }); expect(await initializeDocumentDefaults()).toMatchObject({ success: true, data: 0 });
  const tor = await client.documentConfig.findUniqueOrThrow({ where: { typeId: "TOR" } }); await client.documentConfig.update({ where: { id: tor.id }, data: { price: 17525 } });
  expect(await initializeDocumentDefaults()).toMatchObject({ data: 0 }); expect((await client.documentConfig.findUniqueOrThrow({ where: { id: tor.id } })).price).toBe(17525);
  expect(await client.auditLog.count({ where: { action: "DOCUMENT_DEFAULTS_ADDED" } })).toBe(1);
});
it.each(["0.00", "150.50"])("preserves exact PHP %s, deduplicates a create intent, and rejects changed reuse", async price => {
  const form = docForm(undefined, { price }); const first = await createDocumentConfig(form); expect(first).toMatchObject({ success: true, data: { price: price === "0.00" ? 0 : 15050 } });
  expect(await createDocumentConfig(form)).toEqual(first); expect(await client.documentConfig.count()).toBe(1); expect(await client.auditLog.count({ where: { action: "DOCUMENT_CREATED" } })).toBe(1);
  form.set("price", "160.50"); expect(await createDocumentConfig(form)).toMatchObject({ success: false, code: "conflict" });
});
it("atomically updates canonical document fields with a monotonic version and preserves saved request quotes", async () => {
  const row = await client.documentConfig.create({ data: { typeId: "SYNTHETIC", label: "Old label", description: "Old description", price: 10000, updatedAt: version } });
  const request = await client.request.create({ data: { studentId: "synthetic_student", studentName: "Synthetic", studentNumber: "22-12345-123", documentType: row.typeId, purpose: "PERSONAL", paymentMethod: "cash", status: "PROCESSING", paymentStatus: "CASH_ON_PICKUP", quotedAmountCentavos: 10000 } });
  const form = docForm(row); const first = await updateDocumentConfig(form); expect(first).toMatchObject({ success: true, data: { typeId: row.typeId, price: 15050 } });
  const saved = await client.documentConfig.findUniqueOrThrow({ where: { id: row.id } }); expect(saved.updatedAt.getTime()).toBeGreaterThan(row.updatedAt.getTime());
  expect((await client.request.findUniqueOrThrow({ where: { id: request.id } })).quotedAmountCentavos).toBe(10000);
  expect(await updateDocumentConfig(form)).toEqual(first); expect(await client.auditLog.count({ where: { action: "DOCUMENT_UPDATED" } })).toBe(1);
  form.set("price", "200.50"); expect(await updateDocumentConfig(form)).toMatchObject({ success: false, code: "conflict" });
});
it("rolls document/settings writes back with their audit if recording evidence fails", async () => {
  const row = await client.documentConfig.create({ data: { typeId: "TOR", label: "Before", description: "Before", price: 10000, updatedAt: version } }); failAudit = true;
  expect(await updateDocumentConfig(docForm(row))).toMatchObject({ success: false, code: "unavailable" });
  expect((await client.documentConfig.findUniqueOrThrow({ where: { id: row.id } })).price).toBe(10000);
  expect(await updateSystemSetting(settingForm("MAINTENANCE_MODE", "true"))).toMatchObject({ success: false, code: "unavailable" }); expect(await client.systemSettings.count()).toBe(0);
});
it("allows only one of two conflicting document edits with the same observed version", async () => {
  const row = await client.documentConfig.create({ data: { typeId: "RACE", label: "Old label", description: "Old", price: 10000, updatedAt: version } });
  const results = await Promise.all([updateDocumentConfig(docForm(row, { price: "200.25" })), updateDocumentConfig(docForm(row, { price: "300.75" }))]);
  expect(results.filter(result => result.success)).toHaveLength(1); expect(results.filter(result => !result.success)).toHaveLength(1);
  expect(await client.auditLog.count({ where: { action: "DOCUMENT_UPDATED" } })).toBe(1);
  expect([20025, 30075]).toContain((await client.documentConfig.findUniqueOrThrow({ where: { id: row.id } })).price);
});
it("repairs malformed settings explicitly, canonicalizes values, and rejects stale overwrites", async () => {
  const broken = await client.systemSettings.create({ data: { key: "PAYMENT_METHODS", value: "malformed", updatedAt: version } });
  expect((await loadAdminSettings()).entries.find(item => item.key === broken.key)).toMatchObject({ valid: false, version: version.toISOString() });
  const form = settingForm(broken.key, '{"online":false,"cash":true}', broken.updatedAt); const first = await updateSystemSetting(form); expect(first).toMatchObject({ success: true, data: { valid: true, value: '{"online":false,"cash":true}' } });
  expect(await updateSystemSetting(form)).toEqual(first); expect(await client.auditLog.count({ where: { action: "SYSTEM_SETTING_UPDATED" } })).toBe(1);
  form.set("value", '{"online":true,"cash":true}'); expect(await updateSystemSetting(form)).toMatchObject({ success: false, code: "conflict" });
  expect((await client.systemSettings.findUniqueOrThrow({ where: { key: broken.key } })).value).toBe('{"online":false,"cash":true}');
});
it("keeps queued notification snapshots unchanged and blank template overrides use the real default", async () => {
  await updateSystemSetting(settingForm("EMAIL_TEMPLATES", '{"READY_FOR_PICKUP":"Original message"}'));
  const request = await client.request.create({ data: { studentId: "synthetic_student", studentName: "Synthetic", studentNumber: "22-12345-123", documentType: "TOR", purpose: "PERSONAL", paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "READY_FOR_PICKUP", notificationVersion: 1 } });
  await client.$transaction(tx => enqueueRequestNotification(tx, request, "synthetic_first"));
  const setting = await client.systemSettings.findUniqueOrThrow({ where: { key: "EMAIL_TEMPLATES" } });
  await updateSystemSetting(settingForm("EMAIL_TEMPLATES", '{"READY_FOR_PICKUP":""}', setting.updatedAt));
  await client.$transaction(tx => enqueueRequestNotification(tx, { ...request, notificationVersion: 2 }, "synthetic_second"));
  expect((await client.notificationOutbox.findUniqueOrThrow({ where: { id: "synthetic_first" } })).content).toMatchObject({ customMessage: "Original message" });
  expect((await client.notificationOutbox.findUniqueOrThrow({ where: { id: "synthetic_second" } })).content).toMatchObject({ customMessage: expect.stringContaining("Window 4") });
});
it("persists explicit normalization instead of treating legacy blank overrides as already reset", async () => {
  const legacy = await client.systemSettings.create({ data: { key: "EMAIL_TEMPLATES", value: '{"PROCESSING":"   "}', updatedAt: version } });
  const result = await updateSystemSetting(settingForm("EMAIL_TEMPLATES", "{}", legacy.updatedAt));
  expect(result).toMatchObject({ success: true, data: { value: "{}" } });
  expect((await client.systemSettings.findUniqueOrThrow({ where: { key: legacy.key } })).value).toBe("{}");
  expect(await client.auditLog.count({ where: { action: "SYSTEM_SETTING_UPDATED" } })).toBe(1);
});
it("does not cross the catalog capacity boundary on create or default initialization", async () => {
  await db.exec(`INSERT INTO "DocumentConfig" ("id","typeId","label","description","price","updatedAt") SELECT 'doc_' || n::text, 'CODE_' || n::text, 'Synthetic', 'Synthetic', 0, now() FROM generate_series(1,1000) n`);
  expect(await createDocumentConfig(docForm())).toMatchObject({ success: false, code: "invalid" }); expect(await initializeDocumentDefaults()).toMatchObject({ success: false, code: "invalid" });
  expect(await client.documentConfig.count()).toBe(1000);
});
it("rolls back growth that would make a valid catalog exceed its response-byte budget", async () => {
  const rows = Array.from({ length: 340 }, (_, i) => ({ id: "bulk_" + i, typeId: "BULK_" + i, label: "Synthetic", description: "文".repeat(2000), price: 0, isActive: true, updatedAt: version }));
  while (Buffer.byteLength(JSON.stringify(rows), "utf8") + 1000 > 2_000_000) rows.pop();
  await client.documentConfig.createMany({ data: rows });
  expect((await loadAdminDocuments()).items).toHaveLength(rows.length);
  const result = await createDocumentConfig(docForm(undefined, { description: "文".repeat(2000) }));
  expect(result).toMatchObject({ success: false, code: "invalid" }); expect(await client.documentConfig.count()).toBe(rows.length);
});
