"use client";

import { useUser } from "@clerk/nextjs";
import { resolveProfileIdentity, type ServerUser } from "@/lib/profile-identity";

export function useProfileIdentity(serverUser?: ServerUser) {
  const { user, isLoaded } = useUser();
  const profile = resolveProfileIdentity(isLoaded, user, serverUser);
  return { profile, loading: !isLoaded && !profile };
}
