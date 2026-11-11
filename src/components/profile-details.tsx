"use client";

import { useProfileIdentity } from "./use-profile-identity";
import { roleLabel, type ServerUser } from "@/lib/profile-identity";
import { Skeleton } from "@/components/ui/skeleton";

export function ProfileDetails({ serverUser }: { serverUser?: ServerUser }) {
  const { profile, loading } = useProfileIdentity(serverUser);
  if (!profile && !loading) return null;
  return <div className="flex flex-col whitespace-nowrap overflow-hidden">
    <span className="text-sm font-semibold text-foreground truncate">
      {profile ? profile.name : <Skeleton className="h-4 w-24" />}
    </span>
    <span className="text-xs text-primary font-medium uppercase tracking-wide truncate">
      {profile ? roleLabel(profile.role) : <Skeleton className="h-3 w-16 mt-1.5" />}
    </span>
  </div>;
}
