import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "./auth";
import { readClerkAccounts, AccountSnapshotError } from "./clerk-account-snapshot";
import { rolesSnapshotSchema } from "./configuration-fetcher";
import prisma from "./prisma";
import { effectiveRole } from "./role-policy";
export async function loadRoleAccounts() {
  const actorId = await requireAdmin(); const provider = await clerkClient();
  const [accounts, active] = await Promise.all([readClerkAccounts(provider.users), prisma.roleChangeOperation.findUnique({ where: { activeKey: "global" } })]);
  const policies = await prisma.roleAccess.findMany({ where: { userId: { in: accounts.map(user => user.id) } } });
  const byId = new Map(policies.map(policy => [policy.userId, policy]));
  const operation = active ? { id: active.id, targetId: active.targetId, previousRole: active.previousRole, nextRole: active.nextRole, stage: active.stage } : null;
  const result = rolesSnapshotSchema.parse({ actorId, operation, asOf: new Date().toISOString(), users: accounts.map(user => ({ id: user.id,
    name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Unnamed User", email: user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress ?? null,
    role: effectiveRole(user.publicMetadata, byId.get(user.id) ?? null) ?? "unknown",
    roleVersion: typeof user.publicMetadata.roleOperationId === "string" ? user.publicMetadata.roleOperationId : "unmanaged",
    blocked: byId.get(user.id)?.blocked ?? false })) });
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 2_000_000) throw new AccountSnapshotError(413);
  return result;
}
