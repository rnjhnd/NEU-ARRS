import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/auth";
import { runRoleChange, recoverRoleChange } from "../role-operations";
import { effectiveRole } from "../role-policy";

let db: PGlite, socket: PGLiteSocketServer, client: PrismaClient;
type User = { id: string; firstName: string; lastName: string; imageUrl: string; primaryEmailAddressId: null; emailAddresses: []; publicMetadata: { role: string; roleOperationId?: string }; banned: boolean; locked: boolean };
const users = new Map<string, User>(), sessions = new Map<string, { id: string; userId: string; status: string }>();
let failWrite: "no" | "before" | "after", failRevoke: boolean;
const getUser = vi.fn(async (id: string) => { const user = users.get(id); if (!user) throw new Error("synthetic missing user"); return structuredClone(user); });
const updateUserMetadata = vi.fn(async (id: string, input: { publicMetadata: User["publicMetadata"] }) => {
  if (failWrite === "before") throw new Error("synthetic offline");
  const user = users.get(id)!; user.publicMetadata = { ...user.publicMetadata, ...input.publicMetadata };
  if (failWrite === "after") throw new Error("synthetic lost response");
  return structuredClone(user);
});
const getSessionList = vi.fn(async (input: { userId: string; limit: number; offset: number }) => {
  const active = [...sessions.values()].filter(s => s.userId === input.userId && s.status === "active");
  return { totalCount: active.length, data: active.slice(input.offset, input.offset + input.limit).map(s => ({ ...s })) };
});
const revokeSession = vi.fn(async (id: string) => { if (failRevoke) throw new Error("synthetic revoke unavailable"); sessions.get(id)!.status = "revoked"; return { ...sessions.get(id)! }; });
const provider = { users: { getUser, updateUserMetadata, getUserList: async () => ({ totalCount: users.size, data: [...users.values()] }) }, sessions: { getSessionList, revokeSession, getSession: async (id: string) => sessions.get(id) } } as unknown as Awaited<ReturnType<typeof clerkClient>>;
const input = (targetId = "target", previousRole = "student", nextRole = "employee", intentId = randomUUID(), expectedOperationId = "unmanaged") => ({ targetId, previousRole, nextRole, intentId, expectedOperationId });
const run = (value = input()) => runRoleChange("admin_a", value, client, provider);
beforeAll(async () => {
  db = await PGlite.create(); const root = resolve(process.cwd(), "prisma/migrations");
  for (const entry of (await readdir(root, { withFileTypes: true })).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(await readFile(resolve(root, entry.name, "migration.sql"), "utf8"));
  socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 3 }); await socket.start();
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable`, max: 2 }) });
}, 60000);
afterAll(async () => { await client?.$disconnect(); await socket?.stop(); await db?.close(); });
beforeEach(async () => {
  vi.clearAllMocks(); vi.mocked(requireAdmin).mockResolvedValue("admin_a"); failWrite = "no"; failRevoke = false;
  await client.roleAccess.deleteMany(); await client.roleChangeOperation.deleteMany(); await client.auditLog.deleteMany(); users.clear(); sessions.clear();
  for (const [id, role] of [["admin_a", "admin"], ["admin_b", "admin"], ["target", "student"]]) users.set(id, { id, publicMetadata: { role }, firstName: "Synthetic", lastName: id, imageUrl: "", primaryEmailAddressId: null, emailAddresses: [], banned: false, locked: false });
});
it("commits fenced roles and audited outcomes, revokes all shrinking pages, and replays once", async () => {
  for (let i = 0; i < 251; i++) sessions.set("s" + i, { id: "s" + i, userId: "target", status: "active" });
  const intent = input(); const result = await run(intent); expect(result).toMatchObject({ success: true, operation: { stage: "COMPLETE" } });
  expect(revokeSession).toHaveBeenCalledTimes(251); expect(getSessionList.mock.calls.map(([p]) => p.offset)).toEqual([0, 0, 0, 0]);
  expect(await client.roleAccess.findUnique({ where: { userId: "target" } })).toMatchObject({ blocked: false, role: "employee" });
  expect(await run(intent)).toEqual(result); expect(updateUserMetadata).toHaveBeenCalledTimes(1);
  expect(await client.auditLog.count()).toBe(3); expect(await client.roleChangeOperation.count({ where: { activeKey: "global" } })).toBe(0);
});
it("retains a blocked durable operation when a metadata response is lost and resumes without a second write", async () => {
  failWrite = "after"; const result = await run(); expect(result).toMatchObject({ success: false, operation: { stage: "APPLYING" } });
  const operation = await client.roleChangeOperation.findFirstOrThrow(); expect(await client.roleAccess.findUnique({ where: { userId: "target" } })).toMatchObject({ blocked: true });
  expect(effectiveRole(users.get("target")!.publicMetadata, await client.roleAccess.findUnique({ where: { userId: "target" } }))).toBeNull();
  failWrite = "no"; expect(await recoverRoleChange("admin_a", operation.id, client, provider, true)).toMatchObject({ success: true }); expect(updateUserMetadata).toHaveBeenCalledTimes(1);
});
it("requires explicit retry of the same payload after a provider call did not arrive", async () => {
  failWrite = "before"; const result = await run(); expect(result.success).toBe(false); const op = await client.roleChangeOperation.findFirstOrThrow();
  failWrite = "no"; expect(await recoverRoleChange("admin_a", op.id, client, provider)).toMatchObject({ success: false }); expect(updateUserMetadata).toHaveBeenCalledTimes(1);
  expect(await recoverRoleChange("admin_a", op.id, client, provider, true)).toMatchObject({ success: true }); expect(updateUserMetadata).toHaveBeenCalledTimes(2);
});
it("retains REVOKING on partial failure and resumes across requests without repeating metadata", async () => {
  sessions.set("s", { id: "s", userId: "target", status: "active" }); failRevoke = true;
  expect(await run()).toMatchObject({ success: false, operation: { stage: "REVOKING" } });
  const op = await client.roleChangeOperation.findFirstOrThrow(); expect(await client.roleAccess.findUnique({ where: { userId: "target" } })).toMatchObject({ blocked: true });
  failRevoke = false; expect(await recoverRoleChange("admin_a", op.id, client, provider)).toMatchObject({ success: true }); expect(updateUserMetadata).toHaveBeenCalledTimes(1);
});
it("rejects a changed intent payload, stale observed roles, and observed-version ABA", async () => {
  const intent = input(); expect(await run(intent)).toMatchObject({ success: true });
  expect(await run({ ...intent, nextRole: "admin" })).toMatchObject({ success: false, code: "conflict" });
  expect(await run(input())).toMatchObject({ success: false, operation: { stage: "REJECTED" } });
  const marker = users.get("target")!.publicMetadata.roleOperationId!;
  expect(await run(input("target", "employee", "student", randomUUID(), marker))).toMatchObject({ success: true });
  expect(await run(input())).toMatchObject({ success: false, operation: { stage: "REJECTED" } });
});
it("serializes competing administrator demotions and reauthorizes a queued actor", async () => {
  failWrite = "before"; expect(await run(input("admin_b", "admin", "student"))).toMatchObject({ success: false });
  expect(await runRoleChange("admin_b", input("admin_a", "admin", "student"), client, provider)).toMatchObject({ success: false, code: "conflict" });
  expect(updateUserMetadata).toHaveBeenCalledTimes(1);
  const op = await client.roleChangeOperation.findFirstOrThrow(); failWrite = "no";
  vi.mocked(requireAdmin).mockRejectedValue(new Error("Forbidden: demoted actor"));
  expect(await recoverRoleChange("admin_a", op.id, client, provider, true)).toMatchObject({ success: false }); expect(updateUserMetadata).toHaveBeenCalledTimes(1);
});
it("rejects self changes, unknown roles, and a missing other verified administrator", async () => {
  expect(await run(input("admin_a", "admin", "student"))).toMatchObject({ code: "invalid" });
  expect(await run(input("target", "student", "owner"))).toMatchObject({ code: "invalid" });
  users.delete("admin_a"); expect(await run(input("admin_b", "admin", "student"))).toMatchObject({ success: false, operation: { stage: "REJECTED" } }); expect(updateUserMetadata).not.toHaveBeenCalled();
});
it("allows only one genuinely concurrent cross-demotion through the database gate", async () => {
  vi.mocked(requireAdmin).mockImplementation(async () => (await client.roleChangeOperation.findUniqueOrThrow({ where: { activeKey: "global" } })).actorId);
  const results = await Promise.all([run(input("admin_b", "admin", "student")), runRoleChange("admin_b", input("admin_a", "admin", "student"), client, provider)]);
  expect(results.filter(result => result.success)).toHaveLength(1); expect(updateUserMetadata).toHaveBeenCalledTimes(1);
  expect([...users.values()].filter(user => user.publicMetadata.role === "admin")).toHaveLength(1);
});
it("does not steal an unexpired recovery lease", async () => {
  failWrite = "before"; await run(); const op = await client.roleChangeOperation.findFirstOrThrow();
  await client.roleChangeOperation.update({ where: { id: op.id }, data: { leaseToken: "other-worker", leaseUntil: new Date(Date.now() + 60_000) } });
  failWrite = "no"; expect(await recoverRoleChange("admin_a", op.id, client, provider, true)).toMatchObject({ success: false }); expect(updateUserMetadata).toHaveBeenCalledTimes(1);
});
it("does not permit recovery to bypass the self-change restriction", async () => {
  const operation = await client.roleChangeOperation.create({ data: { id: "role_" + "b".repeat(64), actorId: "admin_a", targetId: "admin_b", previousRole: "admin", previousOperationId: "unmanaged", nextRole: "student", activeKey: "global" } });
  await expect(recoverRoleChange("admin_b", operation.id, client, provider, true)).rejects.toThrow("another administrator"); expect(updateUserMetadata).not.toHaveBeenCalled();
});
it("does not release account access if final audit persistence fails", async () => {
  await db.exec(`CREATE FUNCTION fail_role_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'ROLE_CHANGE_COMPLETED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER role_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_role_completion();`);
  try { expect(await run()).toMatchObject({ success: false }); expect(await client.roleAccess.findUnique({ where: { userId: "target" } })).toMatchObject({ blocked: true }); expect(await client.roleChangeOperation.findFirst()).toMatchObject({ stage: "REVOKING", activeKey: "global" }); }
  finally { await db.exec('DROP TRIGGER role_audit_failure ON "AuditLog"; DROP FUNCTION fail_role_completion();'); }
});
it("fences late provider writes and prevents unsafe active-key states in SQL", async () => {
  expect(await run()).toMatchObject({ success: true });
  const access = await client.roleAccess.findUnique({ where: { userId: "target" } });
  expect(effectiveRole({ role: "admin", roleOperationId: "old" }, access)).toBeNull();
  await expect(client.roleChangeOperation.create({ data: { id: "bad", actorId: "a", targetId: "b", previousRole: "student", previousOperationId: "unmanaged", nextRole: "admin", activeKey: null } })).rejects.toThrow();
});
