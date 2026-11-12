import { auth, clerkClient } from "@clerk/nextjs/server";
import { cache } from "react";
import prisma from "./prisma";
import { effectiveRole } from "./role-policy";

export class AccessError extends Error {
  constructor(readonly status: 401 | 403 | 503) {
    super(status === 401 ? "Unauthorized: Sign in again." : status === 403 ? "Forbidden: Account access is not permitted." : "Authentication unavailable: Try again later.");
  }
}
// React cache deduplicates one RSC render only. Actions and route handlers verify
// afresh, without a cross-request cache or JWT-role fallback.
export const getVerifiedActor = cache(async () => {
  const { userId, sessionId } = await auth();
  if (!userId || !sessionId) throw new AccessError(401);
  try {
    const client = await clerkClient();
    const session = await client.sessions.getSession(sessionId);
    if (session.id !== sessionId || session.userId !== userId || session.status !== "active" || !Number.isFinite(session.expireAt) || session.expireAt <= Date.now()) throw new AccessError(401);
    const user = await client.users.getUser(userId);
    if (user.id !== userId || user.banned || user.locked) throw new AccessError(403);
    const policy = await prisma.roleAccess.findUnique({ where: { userId } });
    const role = effectiveRole(user.publicMetadata, policy);
    if (!role) throw new AccessError(403);
    return { userId, role };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    if (error && typeof error === "object" && "status" in error && error.status === 404) throw new AccessError(401);
    throw new AccessError(503);
  }
});
export async function requireAuth() { return (await getVerifiedActor()).userId; }
export async function requireAdmin() {
  const actor = await getVerifiedActor();
  if (actor.role !== "admin") throw new AccessError(403);
  return actor.userId;
}
export async function requireEmployeeOrAdmin() {
  const actor = await getVerifiedActor();
  if (actor.role !== "admin" && actor.role !== "employee") throw new AccessError(403);
  return actor.userId;
}
export async function requireStudent() {
  const actor = await getVerifiedActor();
  if (actor.role !== "student") throw new AccessError(403);
  return actor.userId;
}
