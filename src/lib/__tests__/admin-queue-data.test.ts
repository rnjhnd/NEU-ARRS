import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { clerkClient } from "@clerk/nextjs/server";
import { AccessError, getVerifiedActor } from "@/lib/auth";
import { loadAdminQueue, loadQueueExport } from "../admin-queue-data";
import { DEFAULT_QUEUE_QUERY, adminQueueSchema, type QueueQuery } from "../admin-queue-model";

let db: PGlite, socket: PGLiteSocketServer, client: PrismaClient;
const statuses = ["PENDING_PAYMENT", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"] as const;
const source = Array.from({ length: 1007 }, (_, i) => ({ id: "request_" + String(i).padStart(4, "0"), studentId: "student_" + i,
  studentName: "Student " + String(i).padStart(4, "0"), studentNumber: "22-12345-123", documentType: i % 2 ? "TOR" : "GOOD_MORAL", purpose: "PERSONAL" as const,
  paymentMethod: "online", paymentStatus: "PAID" as const, status: statuses[i % 5], createdAt: new Date("2026-01-01"), updatedAt: new Date(Date.UTC(2026, 0, 1, Math.floor(i / 3))) }));
const accounts = source.map((row, i) => ({ id: row.studentId, primaryEmailAddressId: "primary", emailAddresses: [{ id: "primary", emailAddress: "student" + i + "@example.invalid" }, { id: "other", emailAddress: "secondary@example.invalid" }], firstName: "Synthetic", publicMetadata: {} }));
const getUsers = vi.fn(async (args: { query?: string; userId?: string[]; offset?: number; limit: number }) => {
  const filtered = accounts.filter(user => args.userId ? args.userId.includes(user.id) : args.query ? user.emailAddresses.some(e => e.emailAddress.toLowerCase().includes(args.query!.toLowerCase())) : true);
  return { totalCount: filtered.length, data: filtered.slice(args.offset ?? 0, (args.offset ?? 0) + args.limit) };
});
const provider = { getUserList: getUsers } as unknown as Awaited<ReturnType<typeof clerkClient>>["users"];
beforeAll(async () => {
  db = await PGlite.create(); const root = resolve(process.cwd(), "prisma/migrations");
  for (const entry of (await readdir(root, { withFileTypes: true })).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(await readFile(resolve(root, entry.name, "migration.sql"), "utf8"));
  socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 3 }); await socket.start();
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable`, max: 2 }) });
  await client.documentConfig.create({ data: { typeId: "TOR", label: "Alpha Transcript", description: "Synthetic", price: 15050 } });
  for (let i = 0; i < source.length; i += 200) await client.request.createMany({ data: source.slice(i, i + 200) });
}, 60000);
afterAll(async () => { await client?.$disconnect(); await socket?.stop(); await db?.close(); });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getVerifiedActor).mockResolvedValue({ userId: "staff", role: "admin" }); });
const load = (changes: Partial<QueueQuery> = {}) => loadAdminQueue({ ...DEFAULT_QUEUE_QUERY, ...changes }, client, provider);
it("keeps document identifiers stable when configured display labels change", async () => {
  try {
    await client.documentConfig.update({ where: { typeId: "TOR" }, data: { label: "Renamed transcript" } });
    const queue = await load({ search: "Renamed transcript" });
    expect(queue.items.length).toBeGreaterThan(0);
    expect(queue.items.every(item => item.documentTypeId === "TOR" && item.documentLabel === "Renamed transcript")).toBe(true);
    expect(queue.items[0]).not.toHaveProperty("documentType");
  } finally { await client.documentConfig.update({ where: { typeId: "TOR" }, data: { label: "Alpha Transcript" } }); }
});
it("reads one ten-row page with global counts and at most ten profile IDs", async () => {
  const queue = await load(); expect(adminQueueSchema.safeParse(queue).success).toBe(true); expect(queue.items).toHaveLength(10); expect(queue.totalPages).toBe(101); expect(queue.summary.total).toBe(1007);
  expect(queue.summary.pending).toBe(source.filter(r => r.status === "PENDING_PAYMENT").length);
  expect(getUsers).toHaveBeenCalledOnce(); expect(getUsers.mock.calls[0][0].userId).toHaveLength(10);
  expect(Buffer.byteLength(JSON.stringify(queue))).toBeLessThan(6000);
  for (const item of queue.items) for (const key of ["studentId", "paymongoPaymentId", "quotedAmountCentavos", "amountPaid"]) expect(item).not.toHaveProperty(key);
});
it("filters and paginates on the server while leaving whole-queue counts unchanged", async () => {
  const queue = await load({ status: "PROCESSING", page: 2 }); expect(queue.items).toHaveLength(10); expect(queue.items.every(item => item.status === "PROCESSING")).toBe(true);
  expect(queue.total).toBe(source.filter(r => r.status === "PROCESSING").length); expect(queue.summary.total).toBe(source.length); expect(queue.query.page).toBe(2);
});
it("uses an ordered index scan without a full sort for default staff pages", async () => {
  await db.exec('ANALYZE "Request"');
  for (const where of ["", "WHERE r.\"status\" = 'PROCESSING'"]) {
    const result = await db.query(`EXPLAIN (ANALYZE, FORMAT JSON) SELECT r."id" FROM "Request" r ${where} ORDER BY r."updatedAt" DESC, r."id" ASC LIMIT 10`);
    const plan = JSON.stringify(result.rows);
    expect(plan).toContain('"Node Type":"Index'); expect(plan).not.toContain('"Node Type":"Sort"');
    expect(plan).toContain('"Actual Rows":10');
  }
});
it.each((["studentName", "documentLabel", "paymentStatus", "updatedAt", "status"] as const).flatMap(sort => (["asc", "desc"] as const).map(direction => ({ sort, direction }))))("orders pages deterministically by $sort $direction", async ({ sort, direction }) => {
  const first = await load({ sort, direction }), second = await load({ sort, direction, page: 2 });
  expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(20);
  const value = (item: typeof first.items[number]) => sort === "updatedAt" ? item.updatedAt : item[sort].toLowerCase();
  const ordered = (a: string, b: string) => direction === "asc" ? a <= b : a >= b;
  expect(first.items.every((item, i, items) => i === 0 || ordered(value(items[i - 1]), value(item)))).toBe(true);
  expect(ordered(value(first.items[9]), value(second.items[0]))).toBe(true);
});
it("clamps an out-of-range page and returns a real empty search without querying page emails", async () => {
  const last = await load({ page: 999 }); expect(last.query.page).toBe(101); expect(last.items).toHaveLength(7);
  getUsers.mockClear(); const empty = await load({ search: "not-present-anywhere", page: 2 }); expect(empty.items).toEqual([]); expect(empty.query.page).toBe(1); expect(empty.total).toBe(0); expect(getUsers).toHaveBeenCalledOnce();
});
it("searches stored identities, current labels, literal wildcards and primary email across all rows", async () => {
  expect((await load({ search: "Student 0999" })).items.map(i => i.id)).toEqual(["request_0999"]);
  expect((await load({ search: "student999@example.invalid" })).items.map(i => i.id)).toEqual(["request_0999"]);
  expect((await load({ search: "Alpha Transcript" })).total).toBe(source.filter(r => r.documentType === "TOR").length);
  expect((await load({ search: "%_' OR TRUE --" })).total).toBe(0);
  expect((await load({ search: "secondary@example.invalid" })).total).toBe(0);
});
it("pages large matching profile sets and fails explicitly when search completeness is unknown", async () => {
  expect((await load({ search: "example.invalid" })).total).toBe(1007);
  expect(getUsers.mock.calls.filter(([q]) => q.query).map(([q]) => q.offset)).toEqual([0, 500, 1000]);
  getUsers.mockRejectedValueOnce(new Error("synthetic private provider details")); await expect(load({ search: "example" })).rejects.toMatchObject({ status: 503 });
  getUsers.mockResolvedValueOnce({ data: [], totalCount: 5001 }); await expect(load({ search: "broad" })).rejects.toMatchObject({ status: 413 });
});
it("keeps an unfiltered page usable with explicit email degradation", async () => {
  getUsers.mockRejectedValueOnce(new Error("synthetic outage")); const queue = await load(); expect(queue.items).toHaveLength(10); expect(queue.emailLookupFailed).toBe(true); expect(queue.items.every(i => i.studentEmail === null)).toBe(true);
});
it("rejects truncated, duplicate and changing provider search results instead of returning false matches", async () => {
  getUsers.mockResolvedValueOnce({ data: [], totalCount: 1 }); await expect(load({ search: "example" })).rejects.toMatchObject({ status: 503 });
  getUsers.mockResolvedValueOnce({ data: [accounts[0], accounts[0]], totalCount: 2 }); await expect(load({ search: "example" })).rejects.toMatchObject({ status: 503 });
  getUsers.mockResolvedValueOnce({ data: accounts.slice(0, 500), totalCount: 1007 }).mockResolvedValueOnce({ data: accounts.slice(500, 1000), totalCount: 1006 });
  await expect(load({ search: "example" })).rejects.toMatchObject({ status: 503 });
});
it("rejects verified students before queue or export data access", async () => {
  vi.mocked(getVerifiedActor).mockResolvedValue({ userId: "student", role: "student" });
  const transaction = vi.spyOn(client, "$transaction");
  try {
    await expect(load()).rejects.toMatchObject({ status: 403 }); await expect(loadQueueExport({}, client, provider)).rejects.toMatchObject({ status: 403 });
    expect(transaction).not.toHaveBeenCalled(); expect(getUsers).not.toHaveBeenCalled();
  } finally { transaction.mockRestore(); }
});
it.each([401, 403, 503] as const)("denies %s before any request/profile IO", async status => {
  vi.mocked(getVerifiedActor).mockRejectedValue(new AccessError(status)); const transaction = vi.spyOn(client, "$transaction");
  await expect(load()).rejects.toMatchObject({ status }); await expect(loadQueueExport({}, client, provider)).rejects.toMatchObject({ status }); expect(transaction).not.toHaveBeenCalled(); expect(getUsers).not.toHaveBeenCalled(); transaction.mockRestore();
});
it("exports full verified rows separately from the displayed page and respects Manila creation dates", async () => {
  const all = await loadQueueExport({}, client, provider, new Date("2026-11-12")); expect(all.csv.split("\r\n")).toHaveLength(1008); expect(all.csv).toContain("request_0000"); expect(all.csv).toContain("request_1006");
  const outside = await loadQueueExport({ from: "2026-02-01", to: "2026-02-02" }, client, provider, new Date("2026-11-12")); expect(outside.csv.split("\r\n")).toHaveLength(1);
  await expect(loadQueueExport({ from: "2027-01-01", to: "2027-01-02" }, client, provider, new Date("2026-11-12"))).rejects.toMatchObject({ status: 400 });
});
it("rejects oversized export cohorts before profile lookup instead of returning partial CSV", async () => {
  const rows = Array.from({ length: 4000 }, (_, i) => ({ ...source[0], id: "export_extra_" + i }));
  try {
    for (let i = 0; i < rows.length; i += 200) await client.request.createMany({ data: rows.slice(i, i + 200) });
    getUsers.mockClear(); await expect(loadQueueExport({}, client, provider, new Date("2026-11-12"))).rejects.toMatchObject({ status: 413 }); expect(getUsers).not.toHaveBeenCalled();
    expect((await load()).items).toHaveLength(10);
  } finally { await client.request.deleteMany({ where: { id: { startsWith: "export_extra_" } } }); }
}, 30000);
it("uses inclusive Manila dates with an exclusive next-midnight boundary", async () => {
  const dates = ["2026-01-31T15:59:59.999Z", "2026-01-31T16:00:00.000Z", "2026-02-01T15:59:59.999Z", "2026-02-01T16:00:00.000Z"];
  try {
    await client.request.createMany({ data: dates.map((createdAt, i) => ({ ...source[0], id: "boundary_" + i, createdAt: new Date(createdAt) })) });
    const { csv } = await loadQueueExport({ from: "2026-02-01", to: "2026-02-01" }, client, provider, new Date("2026-11-12"));
    expect(csv).toContain("boundary_1"); expect(csv).toContain("boundary_2"); expect(csv).not.toContain("boundary_0"); expect(csv).not.toContain("boundary_3");
  } finally { await client.request.deleteMany({ where: { id: { startsWith: "boundary_" } } }); }
});
