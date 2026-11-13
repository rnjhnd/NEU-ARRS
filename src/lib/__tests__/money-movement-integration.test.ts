import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import prisma from "@/lib/prisma";
import { getVerifiedActor, requireAdmin, AccessError } from "@/lib/auth";
import { loadMoneyMovements, movementVersion } from "../money-movement-data";
import { movementTotals, DEFAULT_MOVEMENT_QUERY } from "../money-movement-model";
import { recordMovementDate } from "@/app/actions/money-date.actions";

let db: PGlite, socket: PGLiteSocketServer, client: PrismaClient, failAudit = false, serial = 1;
const now = new Date("2026-11-13T12:00:00Z");
beforeAll(async () => {
  db = await PGlite.create(); const root = resolve(process.cwd(), "prisma/migrations");
  for (const entry of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(await readFile(resolve(root, entry.name, "migration.sql"), "utf8"));
  socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 3 }); await socket.start();
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable`, max: 2 }) });
}, 60000);
afterAll(async () => { await client?.$disconnect(); await socket?.stop(); await db?.close(); });
beforeEach(async () => {
  vi.resetAllMocks(); failAudit = false; vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getVerifiedActor).mockResolvedValue({ userId: "synthetic_admin", role: "admin" }); vi.mocked(requireAdmin).mockResolvedValue("synthetic_admin");
  await client.moneyMovementDate.deleteMany(); await client.requestCompletion.deleteMany(); await client.requestMoney.deleteMany(); await client.auditLog.deleteMany(); await client.request.deleteMany();
  vi.mocked(prisma.$transaction).mockImplementation(async (callback, options) => client.$transaction(async tx => callback(new Proxy(tx, { get(target, key) {
    if (key === "auditLog" && failAudit) return new Proxy(target.auditLog, { get(audit, method) { return method === "create" ? async () => { throw new Error("Synthetic audit outage"); } : Reflect.get(audit, method); } });
    return Reflect.get(target, key);
  } }) as Prisma.TransactionClient), options));
});
afterEach(() => vi.restoreAllMocks());
async function money(options: { paidAt?: string | null; method?: "online" | "cash"; refund?: boolean; amount?: number; status?: "CANCELLED" | "COMPLETED" | "PROCESSING" } = {}) {
  const row = await client.request.create({ data: { studentId: "synthetic_student", studentName: "Synthetic Student", studentNumber: "26-00001-001", documentType: "TOR", purpose: "PERSONAL", paymentMethod: options.method ?? "online", paymentStatus: options.refund ? "REFUNDED" : "PAID", status: options.status ?? "PROCESSING", createdAt: new Date("2026-11-01T00:00:00Z") } });
  const evidence = await client.auditLog.create({ data: { adminId: "synthetic_verifier", requestId: row.id, action: "TEST_COLLECTION", details: "{}" } });
  const refund = options.refund ? await client.auditLog.create({ data: { adminId: "synthetic_verifier", requestId: row.id, action: "TEST_REFUND", details: "{}" } }) : null;
  return client.requestMoney.create({ data: { requestId: row.id, method: options.method ?? "online", collectedCentavos: options.amount ?? 15050, source: options.method === "cash" ? "CASH_CONFIRMATION" : "PAYMONGO_PAYMENT", reference: "synthetic_money:" + serial++, evidenceId: evidence.id,
    verifiedAt: new Date("2026-11-13T01:00:00Z"), paidAt: options.paidAt ? new Date(options.paidAt) : null,
    ...(refund ? { refundedCentavos: options.amount ?? 15050, refundEvidenceId: refund.id, refundVerifiedAt: new Date("2026-11-13T02:00:00Z") } : {}) } });
}
const load = (from = "2026-11-13", to = from) => loadMoneyMovements({ period: "custom", from, to, undatedPage: 1 }, client, now);
function dateForm(row: Awaited<ReturnType<typeof money>>, kind: "COLLECTION" | "REFUND" = "COLLECTION", occurredAt = "2026-11-12T02:00:00Z") {
  const form = new FormData(); const amount = kind === "COLLECTION" ? row.collectedCentavos : row.refundedCentavos!;
  Object.entries({ requestId: row.requestId, kind, version: movementVersion(row.requestId, kind, amount, (kind === "COLLECTION" ? row.evidenceId : row.refundEvidenceId)!), occurredAt,
    reason: "Original synthetic receipt inspected TEST-001", evidenceChecked: "true" }).forEach(([key, value]) => form.set(key, value)); return form;
}
it("uses evidenced transaction dates instead of submission/updated dates and preserves cancelled collections", async () => {
  const row = await money({ paidAt: "2026-11-13T00:00:00Z", status: "CANCELLED" });
  const data = await load(); expect(data.dated.map(item => item.requestId)).toEqual([row.requestId]); expect(movementTotals(data.dated)).toEqual({ collections: 15050, refunds: 0, net: 15050 });
  await client.request.update({ where: { id: row.requestId }, data: { updatedAt: new Date("2027-01-01") } }); expect((await load()).dated).toEqual(data.dated);
  expect((await load("2026-11-01")).dated).toEqual([]);
});
it("keeps gross collection history and dates a refund independently after original-evidence review", async () => {
  const row = await money({ paidAt: "2026-11-10T01:00:00Z", refund: true, status: "CANCELLED" });
  expect((await load()).undatedSummary).toMatchObject({ refunds: 1, refundCentavos: 15050 });
  expect(await recordMovementDate(dateForm(row, "REFUND", "2026-11-13T02:00:00Z"))).toEqual({ success: true });
  expect(movementTotals((await load("2026-11-10")).dated)).toEqual({ collections: 15050, refunds: 0, net: 15050 });
  expect(movementTotals((await load()).dated)).toEqual({ collections: 0, refunds: 15050, net: -15050 });
  expect(movementTotals((await load("2026-11-01", "2026-11-13")).dated)).toEqual({ collections: 15050, refunds: 15050, net: 0 });
});
it("keeps cash with no collection date explicitly undated, including valid zero", async () => {
  const row = await money({ method: "cash", amount: 0, status: "COMPLETED" }); const data = await load();
  expect(data.dated).toEqual([]); expect(data.undated).toMatchObject([{ amountCentavos: 0, occurredAt: null, dateBasis: "UNKNOWN" }]);
  expect(await recordMovementDate(dateForm(row))).toEqual({ success: true }); expect((await load("2026-11-12")).dated[0]).toMatchObject({ amountCentavos: 0, dateBasis: "REGISTRAR_ATTESTATION" });
});
it("never substitutes refund verification time for the actual refund date", async () => {
  await money({ paidAt: "2026-11-13T00:00:00Z", refund: true }); const data = await load();
  expect(data.dated.map(item => item.kind)).toEqual(["COLLECTION"]); expect(data.undated.map(item => item.kind)).toEqual(["REFUND"]);
});
it("rejects an attested refund before a known collection and a collection after a known refund", async () => {
  const known = await money({ paidAt: "2026-11-12T03:00:00Z", refund: true });
  expect(await recordMovementDate(dateForm(known, "REFUND", "2026-11-12T02:00:00Z"))).toMatchObject({ success: false, error: expect.stringContaining("cannot precede") });
  const unknown = await money({ refund: true }); expect(await recordMovementDate(dateForm(unknown, "REFUND", "2026-11-12T02:00:00Z"))).toMatchObject({ success: true });
  expect(await recordMovementDate(dateForm(unknown, "COLLECTION", "2026-11-12T03:00:00Z"))).toMatchObject({ success: false, error: expect.stringContaining("cannot precede") });
});
it("handles inclusive Manila days, midnight and the report snapshot boundary", async () => {
  const before = await money({ paidAt: "2026-11-12T15:59:59.999Z" }), start = await money({ paidAt: "2026-11-12T16:00:00Z" });
  await money({ paidAt: "2026-11-13T12:00:00.001Z" }); await money({ paidAt: "2026-11-13T16:00:00Z" });
  expect((await load()).dated.map(item => item.requestId)).toEqual([start.requestId]); expect((await load("2026-11-12")).dated.map(item => item.requestId)).toEqual([before.requestId]);
});
it.each(["student", "employee"] as const)("denies %s reporting before any query", async role => {
  vi.mocked(getVerifiedActor).mockResolvedValue({ userId: "synthetic", role }); const tx = vi.spyOn(client, "$transaction");
  await expect(loadMoneyMovements(DEFAULT_MOVEMENT_QUERY, client, now)).rejects.toMatchObject({ status: 403 }); expect(tx).not.toHaveBeenCalled();
});
it.each([401, 403] as const)("rejects unauthorized date evidence (%i)", async status => {
  vi.mocked(requireAdmin).mockRejectedValue(new AccessError(status)); expect(await recordMovementDate(new FormData())).toMatchObject({ success: false }); expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("rejects stale evidence versions, future dates, missing confirmation, duplicates and unconfirmed refunds", async () => {
  const row = await money();
  for (const [key, value] of [["version", "a".repeat(64)], ["occurredAt", "2099-01-01T00:00:00Z"], ["evidenceChecked", "false"], ["reason", "short"]]) {
    const form = dateForm(row); form.set(key, value); expect(await recordMovementDate(form)).toMatchObject({ success: false });
  }
  const duplicate = dateForm(row); duplicate.append("kind", "REFUND"); expect(await recordMovementDate(duplicate)).toMatchObject({ success: false });
  const noRefund = dateForm(row); noRefund.set("kind", "REFUND"); expect(await recordMovementDate(noRefund)).toMatchObject({ success: false });
  expect(await client.moneyMovementDate.count()).toBe(0);
});
it("retains known dates, allows one concurrent attestation and preserves immutable audit evidence", async () => {
  const known = await money({ paidAt: "2026-11-12T01:00:00Z" }); expect(await recordMovementDate(dateForm(known))).toMatchObject({ success: false });
  const row = await money(); const results = await Promise.all([recordMovementDate(dateForm(row)), recordMovementDate(dateForm(row))]);
  expect(results.filter(result => result.success)).toHaveLength(1); expect(await client.moneyMovementDate.count()).toBe(1);
  const date = await client.moneyMovementDate.findUniqueOrThrow({ where: { requestId_kind: { requestId: row.requestId, kind: "COLLECTION" } }, include: { evidence: true } });
  expect(date.evidence.action).toBe("MONEY_MOVEMENT_DATE_ATTESTED"); expect(date.occurredAt.toISOString()).toBe("2026-11-12T02:00:00.000Z");
  await expect(client.auditLog.delete({ where: { id: date.evidenceId } })).rejects.toThrow();
});
it("rolls back date evidence when its audit cannot commit and does not change financial amounts", async () => {
  const row = await money(); failAudit = true; expect(await recordMovementDate(dateForm(row))).toMatchObject({ success: false });
  expect(await client.moneyMovementDate.count()).toBe(0); expect(await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.requestId } })).toEqual(row);
});
it("enforces immutable dates, chronology and confirmed-refund prerequisites in the database", async () => {
  const row = await money(); expect(await recordMovementDate(dateForm(row))).toMatchObject({ success: true });
  await expect(client.moneyMovementDate.update({ where: { requestId_kind: { requestId: row.requestId, kind: "COLLECTION" } }, data: { occurredAt: new Date("2026-11-11T00:00:00Z") } })).rejects.toThrow();
  await expect(client.requestMoney.update({ where: { requestId: row.requestId }, data: { paidAt: new Date("2026-11-11T00:00:00Z") } })).rejects.toThrow();
  await client.requestMoney.update({ where: { requestId: row.requestId }, data: { paidAt: new Date("2026-11-12T02:00:00Z") } });
  await expect(client.requestMoney.update({ where: { requestId: row.requestId }, data: { paidAt: null } })).rejects.toThrow();
  const audit = await client.auditLog.create({ data: { adminId: "synthetic", requestId: row.requestId, action: "TEST_INVALID_REFUND_DATE", details: "{}" } });
  await expect(client.moneyMovementDate.create({ data: { requestId: row.requestId, kind: "REFUND", occurredAt: new Date("2026-11-13"), evidenceId: audit.id } })).rejects.toThrow();
});
it("clamps undated pages, never leaks provider identifiers, and reports missing canonical evidence", async () => {
  for (let i = 0; i < 13; i++) await money({ method: "cash", amount: i, status: "COMPLETED" });
  await client.request.create({ data: { studentId: "synthetic", studentName: "Synthetic", studentNumber: "26-00001-001", documentType: "TOR", purpose: "PERSONAL", paymentMethod: "online", paymentStatus: "PAID" } });
  const data = await loadMoneyMovements({ period: "7days", undatedPage: 999 }, client, now);
  expect(data.query.undatedPage).toBe(2); expect(data.undated).toHaveLength(3); expect(data.missingCollectionEvidence).toBe(1);
  for (const row of data.undated) for (const key of ["evidenceId", "studentId", "studentName", "reference"]) expect(row).not.toHaveProperty(key);
});
it("caps dated reports without truncating totals, keeps narrow periods usable and uses the payment-date index", async () => {
  await db.exec(`INSERT INTO "Request" ("id", "studentId", "studentName", "studentNumber", "documentType", "purpose", "paymentMethod", "paymentStatus", "createdAt", "updatedAt")
    SELECT 'movement_bulk_' || n::text, 'synthetic', 'Synthetic', '26-00001-001', 'TOR', 'PERSONAL', 'online', 'PAID', '2025-01-01', '2025-01-01' FROM generate_series(1, 5001) n;
    INSERT INTO "AuditLog" ("id", "adminId", "action", "details", "requestId") SELECT 'movement_bulk_evidence_' || n::text, 'synthetic', 'TEST_COLLECTION', '{}', 'movement_bulk_' || n::text FROM generate_series(1, 5001) n;
    INSERT INTO "RequestMoney" ("requestId", "method", "collectedCentavos", "source", "reference", "evidenceId", "paidAt", "verifiedAt")
    SELECT 'movement_bulk_' || n::text, 'online', 15050, 'PAYMONGO_PAYMENT', 'movement_bulk_ref_' || n::text, 'movement_bulk_evidence_' || n::text, '2025-01-01', '2025-01-01' FROM generate_series(1, 5001) n;`);
  const current = await money({ paidAt: "2026-11-13T01:00:00Z" });
  await expect(loadMoneyMovements({ period: "all", undatedPage: 1 }, client, now)).rejects.toMatchObject({ status: 413 });
  expect((await load()).dated.map(item => item.requestId)).toEqual([current.requestId]);
  await db.exec('ANALYZE "RequestMoney"');
  const plan = await db.query(`EXPLAIN (FORMAT JSON) SELECT "requestId" FROM "RequestMoney" WHERE "paidAt" >= '2026-11-12T16:00:00Z' AND "paidAt" < '2026-11-13T16:00:00Z' AND "paidAt" <= '2026-11-13T12:00:00Z' ORDER BY "paidAt", "requestId" LIMIT 5001`);
  expect(JSON.stringify(plan.rows)).toContain("RequestMoney_paid_date_idx");
});
