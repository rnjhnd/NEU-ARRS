import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient, type Request } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadDirectoryAggregates, loadStudentDirectory, type DirectoryProvider } from "../student-directory-data";
import { isSettledMoneyState } from "../monetary-ledger";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth, clerkClient: vi.fn() }));
let db: PGlite, socket: PGLiteSocketServer, client: PrismaClient;
const source: { row: Request; amount: number | null }[] = [];
beforeAll(async () => {
  db = await PGlite.create(); const root = resolve(process.cwd(), "prisma/migrations");
  for (const entry of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(await readFile(resolve(root, entry.name, "migration.sql"), "utf8"));
  socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 3 }); await socket.start();
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable`, max: 2 }) });
  const variants: { id: string; method: string; status: Request["status"]; payment: Request["paymentStatus"]; amount: number | null }[] = [
    { id: "online_paid", method: "online", status: "PROCESSING", payment: "PAID", amount: 15050 },
    { id: "cash_zero", method: "cash", status: "COMPLETED", payment: "CASH_ON_PICKUP", amount: 0 },
    { id: "cash_paid", method: "cash", status: "COMPLETED", payment: "PAID", amount: 10025 },
    { id: "cash_waiting", method: "cash", status: "READY_FOR_PICKUP", payment: "CASH_ON_PICKUP", amount: null },
    { id: "cash_early", method: "cash", status: "PROCESSING", payment: "PAID", amount: 15000 },
    { id: "cancelled_paid", method: "online", status: "CANCELLED", payment: "PAID", amount: 20000 },
    { id: "refunded", method: "online", status: "CANCELLED", payment: "REFUNDED", amount: 20000 },
    { id: "unpaid", method: "online", status: "PENDING_PAYMENT", payment: "UNPAID", amount: null },
    { id: "unknown_online", method: "online", status: "COMPLETED", payment: "PAID", amount: null },
    { id: "unknown_cash", method: "cash", status: "COMPLETED", payment: "CASH_ON_PICKUP", amount: null },
  ];
  for (const variant of variants) {
    const row = await client.request.create({ data: { id: variant.id, studentId: "student", studentName: "Synthetic Student", studentNumber: "22-12345-123", documentType: "TOR", purpose: "PERSONAL", paymentMethod: variant.method, paymentStatus: variant.payment, status: variant.status, amountPaid: 999999, quotedAmountCentavos: 999999 } });
    source.push({ row, amount: variant.amount });
    if (variant.amount !== null) {
      const audit = await client.auditLog.create({ data: { id: "evidence:" + variant.id, adminId: "synthetic", requestId: variant.id, action: "TEST_COLLECTION", details: "{}" } });
      await client.requestMoney.create({ data: { requestId: row.id, collectedCentavos: variant.amount, method: row.paymentMethod, source: row.paymentMethod === "cash" ? "CASH_CONFIRMATION" : "PAYMONGO_PAYMENT", reference: "receipt:" + row.id, evidenceId: audit.id } });
    }
  }
  await db.exec(`INSERT INTO "Request" ("id", "studentId", "studentName", "studentNumber", "documentType", "purpose", "paymentMethod", "paymentStatus", "status", "updatedAt", "amountPaid")
    SELECT 'bulk_' || n::text, 'bulk_student', 'Synthetic', '22-12345-123', 'TOR', 'PERSONAL', 'online', 'UNPAID', 'PENDING_PAYMENT', now(), 15000 FROM generate_series(1, 6000) n`);
}, 60000);
afterAll(async () => { await client?.$disconnect(); await socket?.stop(); await db?.close(); });
it("aggregates exact canonical centavos with the shared eligibility policy, keeping unknowns separate", async () => {
  const totals = (await loadDirectoryAggregates(["student"], client)).get("student");
  const settled = source.filter(item => isSettledMoneyState(item.row));
  expect(totals).toMatchObject({ requestCount: BigInt(10), collectedCentavos: BigInt(settled.reduce((sum, item) => sum + (item.amount ?? 0), 0)), unverifiedCount: BigInt(settled.filter(item => item.amount === null).length) });
  expect(totals?.collectedCentavos).toBe(BigInt(25075)); expect(totals?.unverifiedCount).toBe(BigInt(2));
  expect((await client.request.findUniqueOrThrow({ where: { id: "unknown_online" } })).amountPaid).toBe(999999);
});
it("returns one aggregate per allowed student even with thousands of request records", async () => {
  const summaries = await loadDirectoryAggregates(["bulk_student", "no_requests"], client);
  expect(summaries.size).toBe(1); expect(summaries.get("bulk_student")).toMatchObject({ requestCount: BigInt(6000), collectedCentavos: BigInt(0), unverifiedCount: BigInt(0) });
  expect(summaries.has("student")).toBe(false);
});
it("uses bound student IDs rather than interpolated SQL", async () => {
  expect((await loadDirectoryAggregates(["student'); DROP TABLE \"Request\"; --"], client)).size).toBe(0);
  expect(await client.request.count()).toBe(6010);
});
it("builds a complete authenticated directory with actual SQL and zero-request students", async () => {
  mockAuth.mockResolvedValue({ userId: "staff", sessionClaims: { metadata: { role: "admin" } } });
  const identity = { firstName: "Synthetic", lastName: "Student", imageUrl: "", primaryEmailAddressId: null, emailAddresses: [], publicMetadata: { role: "student" } };
  const provider: DirectoryProvider = { getUserList: async () => ({ data: [{ ...identity, id: "student" }, { ...identity, id: "no_requests" }], totalCount: 2 }) };
  const directory = await loadStudentDirectory(client, provider);
  expect(directory.totals).toEqual({ students: 2, requests: 10, collectedCentavos: 25075, unverified: 2 });
  expect(directory.items[1]).toMatchObject({ id: "no_requests", requestCount: 0, collectedCentavos: 0, unverifiedCount: 0, email: null });
  expect(JSON.stringify(directory)).not.toContain("999999"); expect(JSON.stringify(directory)).not.toContain("bulk_student");
});
