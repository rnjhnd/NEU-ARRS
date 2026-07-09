"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession, useClerk } from "@clerk/nextjs";

export function SessionGuard() {
  const pathname = usePathname();
  const { session } = useSession();
  const { signOut } = useClerk();

  const checkSession = async () => {
    if (!session) return;
    try {
      await session.reload();
      // If the session is no longer active after reload, sign out
      if (session.status !== "active") {
        await signOut({ redirectUrl: "/" });
      }
    } catch {
      // reload() throws when the session has been revoked server-side — sign out immediately
      await signOut({ redirectUrl: "/" });
    }
  };

  // Check on every client-side route change
  useEffect(() => {
    checkSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, session]);

  // Also check every 30 seconds so idle users get booted without needing to navigate
  useEffect(() => {
    const interval = setInterval(checkSession, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return null;
}
