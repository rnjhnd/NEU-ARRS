import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { Prisma, type PrismaClient, type RoleChangeOperation } from "@prisma/client";
import prisma from "./prisma";
import { requireAdmin } from "./auth";
import { readClerkAccounts } from "./clerk-account-snapshot";
import { effectiveRole, roleIntentSchema, roleOperationSchema, type RoleOperationView } from "./role-policy";

type Provider = Awaited<ReturnType<typeof clerkClient>>;
export type RoleResult = { success: true; operation: RoleOperationView } | {
  success: false; code: "auth" | "invalid" | "conflict" | "unavailable"; error: string; operation?: RoleOperationView;
};
const txOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2000, timeout: 5000 };
function view(op: RoleChangeOperation) { return roleOperationSchema.parse({ id: op.id, targetId: op.targetId, previousRole: op.previousRole, nextRole: op.nextRole, stage: op.stage }); }
class RoleConflict extends Error {}
const pending = (op: RoleChangeOperation): RoleResult => ({ success: false, code: "unavailable", operation: view(op), error: op.stage === "PREPARED" ? "Role validation is incomplete. Resume the recorded operation before starting another change." : "Role recovery is incomplete. The account remains blocked. Resume recovery before starting another role change." });
async function audit(tx: Prisma.TransactionClient, op: RoleChangeOperation, action: string, actorId: string) {
  await tx.auditLog.create({ data: { adminId: actorId, action, details: JSON.stringify(view(op)) } });
}
async function renewLease(db: PrismaClient, id: string, token: string) {
  const now = new Date();
  const renewed = await db.roleChangeOperation.updateMany({ where: { id, activeKey: "global", leaseToken: token, leaseUntil: { gt: now } }, data: { leaseUntil: new Date(now.getTime() + 60_000) } });
  if (renewed.count !== 1) throw new RoleConflict("Role recovery lease changed. Refresh accounts.");
}

// Provider calls never hold database locks. The durable unique activeKey serializes
// all application role changes; leases fence DB transitions after worker loss.
export async function runRoleChange(actorId: string, input: unknown, db: PrismaClient = prisma, provider?: Provider): Promise<RoleResult> {
  const parsed = roleIntentSchema.safeParse(input);
  if (!parsed.success || parsed.data.targetId === actorId || parsed.data.previousRole === parsed.data.nextRole) return { success: false, code: "invalid", error: "Choose a different role for another account." };
  const intent = parsed.data;
  const id = "role_" + createHash("sha256").update(actorId + ":" + intent.intentId).digest("hex");
  try {
    let op = await db.roleChangeOperation.findUnique({ where: { id } });
    if (op && (op.actorId !== actorId || op.targetId !== intent.targetId || op.previousRole !== intent.previousRole || op.nextRole !== intent.nextRole || op.previousOperationId !== intent.expectedOperationId)) throw new RoleConflict("This intent belongs to different role details.");
    if (!op) op = await db.$transaction(async tx => {
      const created = await tx.roleChangeOperation.create({ data: { id, actorId, targetId: intent.targetId, previousRole: intent.previousRole, previousOperationId: intent.expectedOperationId, nextRole: intent.nextRole, activeKey: "global" } });
      await audit(tx, created, "ROLE_CHANGE_REQUESTED", actorId); return created;
    }, txOptions);
    return await recoverRoleChange(actorId, op.id, db, provider);
  } catch (error) { return roleFailure(error); }
}
export function roleFailure(error: unknown): RoleResult {
  if (error instanceof Error && /^(Unauthorized|Forbidden)/.test(error.message)) return { success: false, code: "auth", error: "Administrator access required." };
  if (error instanceof RoleConflict) return { success: false, code: "conflict", error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P2025"].includes(error.code)) return { success: false, code: "conflict", error: "Another role operation is active or the account changed. Refresh before continuing." };
  return { success: false, code: "unavailable", error: "Role outcome could not be verified. Refresh and resume the recorded operation; do not submit a replacement change." };
}

export async function recoverRoleChange(actorId: string, id: string, db: PrismaClient = prisma, suppliedProvider?: Provider, retryMetadata = false): Promise<RoleResult> {
  let op = await db.roleChangeOperation.findUnique({ where: { id } });
  if (!op) throw new RoleConflict("Role operation not found. Refresh accounts.");
  if (op.targetId === actorId) throw new RoleConflict("Ask another administrator to recover a change to your own account.");
  if (op.stage === "COMPLETE") return { success: true, operation: view(op) };
  if (op.stage === "REJECTED") return { success: false, code: "conflict", error: "This role operation was rejected. Refresh accounts before making a new change.", operation: view(op) };
  const token = randomUUID();
  const claimed = await db.roleChangeOperation.updateMany({ where: { id, activeKey: "global", OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + 60_000) } });
  if (!claimed.count) return pending(op);
  const provider = suppliedProvider ?? await clerkClient();
  try {
    // Reauthorize after obtaining the global gate: another admin may have demoted
    // this actor since the incoming request began. This call is uncached in actions.
    if (await requireAdmin() !== actorId) throw new RoleConflict("Administrator changed. Sign in again.");
    if (op.stage === "PREPARED") {
      const [target, accounts] = await Promise.all([provider.users.getUser(op.targetId), readClerkAccounts(provider.users)]);
      const policies = await db.roleAccess.findMany({ where: { userId: { in: accounts.map(user => user.id) } } });
      const policiesById = new Map(policies.map(policy => [policy.userId, policy]));
      const current = effectiveRole(target.publicMetadata, policiesById.get(target.id) ?? null);
      const otherAdmin = accounts.some(user => user.id !== op!.targetId && effectiveRole(user.publicMetadata, policiesById.get(user.id) ?? null) === "admin");
      if (target.id !== op.targetId || target.banned || target.locked || current !== op.previousRole || (target.publicMetadata.roleOperationId ?? "unmanaged") !== op.previousOperationId || op.previousRole === "admin" && !otherAdmin) {
        const rejected = await db.$transaction(async tx => {
          const saved = await tx.roleChangeOperation.update({ where: { id, leaseToken: token, stage: "PREPARED" }, data: { stage: "REJECTED", activeKey: null, leaseToken: null, leaseUntil: null } });
          await audit(tx, saved, "ROLE_CHANGE_REJECTED", actorId); return saved;
        }, txOptions);
        return { success: false, code: "conflict", operation: view(rejected), error: "Account role changed, access is blocked, or no other verified administrator remains. Refresh accounts." };
      }
      await renewLease(db, id, token);
      op = await db.$transaction(async tx => {
        const saved = await tx.roleChangeOperation.update({ where: { id, stage: "PREPARED", leaseToken: token }, data: { stage: "APPLYING" } });
        await tx.roleAccess.upsert({ where: { userId: saved.targetId }, create: { userId: saved.targetId, role: saved.nextRole, operationId: id, blocked: true }, update: { role: saved.nextRole, operationId: id, blocked: true } });
        await audit(tx, saved, "ROLE_ACCESS_BLOCKED", actorId); return saved;
      }, txOptions);
      // Exactly this payload is used on explicit recovery as well. The policy
      // marker prevents a delayed older provider write from granting privileges.
      await renewLease(db, id, token);
      await provider.users.updateUserMetadata(op.targetId, { publicMetadata: { role: op.nextRole, roleOperationId: id } });
    }
    if (op.stage === "APPLYING") {
      let target = await provider.users.getUser(op.targetId);
      if (target.id !== op.targetId) return pending(op);
      if (retryMetadata && (target.publicMetadata.role !== op.nextRole || target.publicMetadata.roleOperationId !== id)) {
        await renewLease(db, id, token);
        target = await provider.users.updateUserMetadata(op.targetId, { publicMetadata: { role: op.nextRole, roleOperationId: id } });
      }
      if (target.id !== op.targetId || target.publicMetadata.role !== op.nextRole || target.publicMetadata.roleOperationId !== id) return pending(op);
      await renewLease(db, id, token);
      op = await db.roleChangeOperation.update({ where: { id, stage: "APPLYING", leaseToken: token }, data: { stage: "REVOKING" } });
    }
    // Always consume page zero of the shrinking active list. Offset pagination
    // while revoking would skip sessions. Bound work and persist REVOKING on error.
    const started = Date.now(); let revoked = 0;
    for (;;) {
      await renewLease(db, id, token);
      const page = await provider.sessions.getSessionList({ userId: op.targetId, status: "active", limit: 100, offset: 0 });
      if (!Number.isSafeInteger(page.totalCount) || page.totalCount < 0 || page.data.length !== Math.min(page.totalCount, 100) || new Set(page.data.map(s => s.id)).size !== page.data.length || page.data.some(s => s.userId !== op!.targetId || s.status !== "active")) return pending(op);
      if (!page.totalCount) break;
      if (revoked + page.data.length > 5000 || Date.now() - started > 20_000) return pending(op);
      for (let i = 0; i < page.data.length; i += 10) {
        await renewLease(db, id, token);
        await Promise.all(page.data.slice(i, i + 10).map(async session => {
          try { await provider.sessions.revokeSession(session.id); }
          catch (error) {
            // A successful revoke with a lost response, or an already-ended
            // session, is confirmed individually before treating it as done.
            const current = await provider.sessions.getSession(session.id).catch(() => null);
            if (!current || current.userId !== op!.targetId || current.status === "active") throw error;
          }
        }));
      }
      revoked += page.data.length;
    }
    const target = await provider.users.getUser(op.targetId);
    if (target.id !== op.targetId || target.banned || target.locked || target.publicMetadata.role !== op.nextRole || target.publicMetadata.roleOperationId !== id) return pending(op);
    await renewLease(db, id, token);
    op = await db.$transaction(async tx => {
      const saved = await tx.roleChangeOperation.update({ where: { id, stage: "REVOKING", leaseToken: token }, data: { stage: "COMPLETE", activeKey: null, leaseUntil: null, leaseToken: null } });
      await tx.roleAccess.update({ where: { userId: saved.targetId, operationId: id }, data: { blocked: false } });
      await audit(tx, saved, "ROLE_CHANGE_COMPLETED", actorId); return saved;
    }, txOptions);
    return { success: true, operation: view(op) };
  } catch { return pending(op); }
  finally {
    await db.roleChangeOperation.updateMany({ where: { id, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } }).catch(() => {});
  }
}
