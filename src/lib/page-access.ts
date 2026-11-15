import "server-only";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { AccessError, getVerifiedActor } from "./auth";
import type { AppRole } from "./role-policy";
import type { PageAccess } from "./page-access-model";

// Both this result and getVerifiedActor are deduplicated only within the RSC
// request. No authorization decision is cached across requests or accounts.
const getPageAccess = cache(async (): Promise<PageAccess> => {
  const actor = await getVerifiedActor();
  const { userId, sessionId } = await auth();
  if (!sessionId || userId !== actor.userId) throw new AccessError(401);
  // A session identifier is not a token. It binds a cached page to the same
  // active Clerk session; never serialize cookies, JWTs or provider credentials.
  return { ...actor, sessionId };
});

export async function requirePageAccess(roles: readonly AppRole[]): Promise<PageAccess> {
  const access = await getPageAccess();
  if (!roles.includes(access.role)) throw new AccessError(403);
  return access;
}
