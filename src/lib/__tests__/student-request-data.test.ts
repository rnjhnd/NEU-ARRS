import { afterAll, beforeAll, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadStudentHistory } from "../student-request-data";
import { DEFAULT_HISTORY_QUERY, studentHistorySchema, type HistoryQuery } from "../student-request-model";

let db: PGlite;
let socket: PGLiteSocketServer;
let client: PrismaClient;
const owner = "pagination_student";
const statuses = ["PENDING_PAYMENT", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"] as const;
const labels = ["Zulu", "Alpha", "Good Moral Certificate"];
const source = Array.from({ length: 31 }, (_, i) => ({
  id: "request_" + String(i).padStart(3, "0"), studentId: owner, studentName: "Synthetic Student", studentNumber: "22-12345-123",
  documentType: ["A", "Z", "GOOD_MORAL"][i % 3], purpose: i % 2 ? "OTHER" as const : "EMPLOYMENT" as const,
  paymentMethod: "online", status: statuses[i % 5], paymentStatus: i % 2 ? "UNPAID" as const : "PAID" as const,
  createdAt: new Date("2026-01-01"), updatedAt: new Date(Date.UTC(2026, 0, 1, Math.floor(i / 3))),
}));

beforeAll(async () => {
  // These owned in-memory resources never read application datasource settings.
  db = await PGlite.create();
  const root = resolve(process.cwd(), "prisma/migrations");
  for (const entry of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    await db.exec(await readFile(resolve(root, entry.name, "migration.sql"), "utf8"));
  }
  socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 3 });
  await socket.start();
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable`, max: 2 }) });
  await client.documentConfig.createMany({ data: [
    { typeId: "A", label: "Zulu", description: "Synthetic", price: 100 },
    { typeId: "Z", label: "Alpha", description: "Synthetic", price: 100 },
  ] });
  await client.request.createMany({ data: [...source, { ...source[0], id: "another_account", studentId: "another_student" }] });
  await db.exec(`INSERT INTO "Request" ("id", "studentId", "studentName", "studentNumber", "documentType", "purpose", "paymentMethod", "updatedAt")
    SELECT 'large_' || lpad(n::text, 5, '0'), 'large_student', 'Synthetic', '22-12345-123', 'A', 'PERSONAL', 'online', '2026-01-01'::timestamp
    FROM generate_series(1, 5001) n`);
}, 60000);
afterAll(async () => { await client?.$disconnect(); await socket?.stop(); await db?.close(); });

it("bounds rows, scopes ownership, and reports full-history counts with the real adapter", async () => {
  const history = await loadStudentHistory(owner, DEFAULT_HISTORY_QUERY, client);
  expect(history.summary).toEqual({ total: 31, active: 19, completed: 6 });
  expect(history.items).toHaveLength(10);
  expect(history.items.map(item => item.id)).not.toContain("another_account");
  expect(studentHistorySchema.safeParse(history).success).toBe(true);
  expect(history.items[0]).not.toHaveProperty("studentName");
  const indexes = await db.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE tablename = 'Request'`);
  expect(indexes.rows.map(row => row.indexname)).toEqual(expect.arrayContaining(["Request_student_history_idx", "Request_student_summary_idx"]));
});

it.each(["id", "documentType", "purpose", "updatedAt", "paymentStatus", "status"] as const)("sorts %s globally in both directions with stable page boundaries", async sort => {
  for (const direction of ["asc", "desc"] as const) {
    const expected = source.map((row, i) => ({ ...row, documentType: labels[i % 3] })).sort((a, b) => {
      const left = sort === "updatedAt" ? a.updatedAt.getTime() : a[sort];
      const right = sort === "updatedAt" ? b.updatedAt.getTime() : b[sort];
      const result = left < right ? -1 : left > right ? 1 : 0;
      return (direction === "asc" ? result : -result) || a.id.localeCompare(b.id);
    });
    const ids: string[] = [];
    for (let page = 1; page <= 4; page++) {
      const history = await loadStudentHistory(owner, { page, sort, direction }, client);
      expect(studentHistorySchema.safeParse(history).success).toBe(true);
      ids.push(...history.items.map(item => item.id));
    }
    expect(ids).toEqual(expected.map(row => row.id));
    expect(new Set(ids).size).toBe(source.length);
  }
}, 15000);

it("clamps out-of-range pages and returns valid empty histories", async () => {
  const last = await loadStudentHistory(owner, { ...DEFAULT_HISTORY_QUERY, page: 100000 }, client);
  expect(last.query.page).toBe(4); expect(last.items).toHaveLength(1);
  const empty = await loadStudentHistory("missing_student", { ...DEFAULT_HISTORY_QUERY, page: 2 }, client);
  expect(empty.summary).toEqual({ total: 0, active: 0, completed: 0 });
  expect(empty.query.page).toBe(1); expect(studentHistorySchema.safeParse(empty).success).toBe(true);
});

it("returns only ten records from a 5,001-request history, including a deep page", async () => {
  const first = await loadStudentHistory("large_student", DEFAULT_HISTORY_QUERY, client);
  const last = await loadStudentHistory("large_student", { ...DEFAULT_HISTORY_QUERY, page: 501 }, client);
  expect(first.items).toHaveLength(10); expect(first.summary.total).toBe(5001);
  expect(last.items).toHaveLength(1); expect(last.items[0].id).toBe("large_05001");
});

it("uses indexed owner access for a selective student's default page query", async () => {
  await db.exec('ANALYZE "Request"; ANALYZE "DocumentConfig"');
  const plan = await db.query(`EXPLAIN (FORMAT JSON)
    SELECT r."id", d."label", r."status", r."updatedAt" FROM "Request" r
    LEFT JOIN "DocumentConfig" d ON d."typeId" = r."documentType"
    WHERE r."studentId" = $1 ORDER BY r."updatedAt" DESC, r."id" ASC LIMIT 10`, [owner]);
  // Equivalent indexes and join strategies are planner choices. The contract is
  // indexed owner access, rather than a particular index name on every dataset.
  const serialized = JSON.stringify(plan.rows);
  expect(serialized).toContain('"Node Type":"Index Scan"');
  expect(serialized).toContain('"Index Cond":"(\\"studentId\\" = \'pagination_student\'::text)"');
});

it("binds caller values and rejects unsupported order expressions", async () => {
  const injected = await loadStudentHistory("' OR true --", DEFAULT_HISTORY_QUERY, client);
  expect(injected.summary.total).toBe(0);
  await expect(loadStudentHistory(owner, { ...DEFAULT_HISTORY_QUERY, sort: 'id"; DROP TABLE "Request"; --' } as unknown as HistoryQuery, client)).rejects.toThrow();
  expect(await client.request.count({ where: { studentId: owner } })).toBe(31);
});
