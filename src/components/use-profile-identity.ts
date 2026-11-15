"use client";

import { useUser } from "@clerk/nextjs";
import { resolveProfileIdentity, type ServerUser } from "@/lib/profile-identity";
import { useVerifiedActor } from "./verified-access";

export function useProfileIdentity(serverUser?: ServerUser) {
  const { user, isLoaded } = useUser();
  const actor = useVerifiedActor();
  const identity = resolveProfileIdentity(isLoaded, user, serverUser);
  // A refreshed role must also update persistent shell controls, even before
  // router.refresh replaces a cached layout's serverUser props.
  const profile = identity && actor?.userId === identity.id ? { ...identity, role: actor.role } : identity;
  return { profile, loading: !isLoaded && !profile };
}
