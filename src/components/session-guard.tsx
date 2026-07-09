"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@clerk/nextjs";

export function SessionGuard() {
  const pathname = usePathname();
  const { session } = useSession();

  useEffect(() => {
    // Force Clerk to verify the session with the backend on every client-side navigation.
    // If an admin has revoked this session (e.g., by changing their role),
    // this reload will fail and Clerk will instantly log them out.
    if (session) {
      session.reload().catch(console.error);
    }
  }, [pathname, session]);

  return null;
}
