import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadFinanceData } from "../finance-data";
import { buildFinanceReport } from "../finance-model";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
let db: PGlite;
let socket: PGLiteSocketServer;
let client: PrismaClient;
const now = new Date("2026-11-11T12:00:00.000Z");
beforeEach(() => mockAuth.mockResolvedValue({ userId: "synthetic_admin", sessionClaims: { metadata: { role: "admin" } } }));
beforeAll(async () => {
  db = await PGlite.create();
  const root = resolve(process.cwd(), "prisma/migrations");
  for (const entry of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    await db.exec(await readFile(resolve(root, entry.name, "migration.sql"), "utf8"));
  }
  socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 3 }); await socket.start();
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable`, max: 2 }) });
  const base = { studentId: "synthetic_student", studentName: "Synthetic", studentNumber: "22-12345-123", documentType: "TOR", purpose: "PERSONAL" as const, paymentMethod: "online", paymentStatus: "PAID" as const, status: "PROCESSING" as const, amountPaid: 99999, quotedAmountCentavos: 15050 };
  await client.request.createMany({ data: [
    { ...base, id: "before_start", createdAt: new Date("2026-11-04T15:59:59.999Z") },
    { ...base, id: "at_start", createdAt: new Date("2026-11-04T16:00:00.000Z") },
    { ...base, id: "today_zero", quotedAmountCentavos: 0, paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "COMPLETED", createdAt: new Date("2026-11-10T16:00:00.000Z") },
    { ...base, id: "legacy_unknown", quotedAmountCentavos: null, createdAt: new Date("2026-11-11T11:59:59.999Z") },
    { ...base, id: "future_today", createdAt: new Date("2026-11-11T12:00:00.001Z") },
    { ...base, id: "at_next_day", createdAt: new Date("2026-11-11T16:00:00.000Z") },
    { ...base, id: "future_year", createdAt: new Date("2027-01-01T00:00:00.000Z") },
  ] });
  for (const [id, method, amount] of [["at_start", "online", 15050], ["today_zero", "cash", 0]] as const) {
    await client.auditLog.create({ data: { id: "collection:" + id, adminId: "synthetic_verifier", requestId: id, action: "TEST_COLLECTION_VERIFIED", details: "{}" } });
    await client.requestMoney.create({ data: { requestId: id, method, collectedCentavos: amount, currency: "PHP", source: method === "cash" ? "CASH_CONFIRMATION" : "PAYMONGO_PAYMENT", reference: "verified:" + id, evidenceId: "collection:" + id } });
  }
  await db.exec(`INSERT INTO "Request" ("id", "studentId", "studentName", "studentNumber", "documentType", "purpose", "paymentMethod", "createdAt", "updatedAt")
    SELECT 'legacy_' || n::text, 'synthetic_student', 'Synthetic', '22-12345-123', 'TOR', 'PERSONAL', 'online', '2025-01-01'::timestamp, '2025-01-01'::timestamp
    FROM generate_series(1, 5001) n`);
}, 60000);
afterAll(async () => { await client?.$disconnect(); await socket?.stop(); await db?.close(); });

it("reads only the requested Manila cohort and never changes stored monetary values", async () => {
  const data = await loadFinanceData({ period: "7days" }, client, now);
  expect(data.items.map(item => item.id)).toEqual(["at_start", "today_zero", "legacy_unknown"]);
  expect(buildFinanceReport(data)).toMatchObject({ total: 15050, knownCount: 2, needsReview: 1 });
  expect((await client.request.findUniqueOrThrow({ where: { id: "at_start" } })).amountPaid).toBe(99999);
  expect(data.items[0]).not.toHaveProperty("studentId");
});
it("supports an inclusive custom day and rejects future-year rows in this-year reports", async () => {
  const custom = await loadFinanceData({ period: "custom", from: "2026-11-11", to: "2026-11-11" }, client, now);
  expect(custom.items.map(item => item.id)).toEqual(["today_zero", "legacy_unknown"]);
  const year = await loadFinanceData({ period: "year" }, client, now);
  expect(year.items.map(item => item.id)).toEqual(["before_start", "at_start", "today_zero", "legacy_unknown"]);
});
it("fails a report beyond the cap and still allows a narrow report afterward", async () => {
  await expect(loadFinanceData({ period: "all" }, client, now)).rejects.toMatchObject({ status: 413 });
  expect((await loadFinanceData({ period: "7days" }, client, now)).items).toHaveLength(3);
});
it("can use the new submission-time index for the real query shape", async () => {
  await db.exec('ANALYZE "Request"');
  const plan = await db.query(`EXPLAIN (FORMAT JSON) SELECT "id", "quotedAmountCentavos" FROM "Request"
    WHERE "createdAt" >= $1 AND "createdAt" < $2 AND "createdAt" <= $3 ORDER BY "createdAt", "id" LIMIT 5001`,
    ["2026-11-04T16:00:00Z", "2026-11-11T16:00:00Z", now.toISOString()]);
  expect(JSON.stringify(plan.rows)).toContain("Request_finance_period_idx");
});
