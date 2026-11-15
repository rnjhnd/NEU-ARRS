"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, useClerk } from "@clerk/nextjs";
import { z } from "zod";
import { roleSchema } from "@/lib/role-policy";
import { PageLoading, WorkspaceLoading } from "@/components/workspace-loading";

const actorSchema = z.object({ userId: z.string().min(1), role: roleSchema }).strict();
const PageAccess = createContext(false);

/** Keep the verified portal shell mounted while a new page is checked. */
export function SessionPage({ children }: { children: ReactNode }) {
  return useContext(PageAccess) ? children : <PageLoading />;
}

export function SessionGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Leaving protected routes unmounts the verification state. Returning from a
  // public page must never reuse a previous visit's access snapshot.
  return /^\/(admin|dashboard|receipt)(\/|$)/.test(pathname) ? <ProtectedSessionGuard>{children}</ProtectedSessionGuard> : children;
}

function ProtectedSessionGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, isLoaded } = useSession();
  const { signOut } = useClerk();
  const sessionKey = session ? session.id + ":" + session.user.id : "anonymous";
  const portal = /^\/admin(\/|$)/.test(pathname) ? "staff" : /^\/dashboard(\/|$)/.test(pathname) ? "student" : "receipt";
  const key = sessionKey + ":" + pathname;
  const [verified, setVerified] = useState<{
    key: string; sessionKey: string; portal: string;
    state: "active" | "denied" | "unavailable" | "redirecting";
    actor?: z.infer<typeof actorSchema>;
  } | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    // Clerk has already ended this session. Do not start an anonymous access
    // check or show another workspace skeleton while sign-out redirects.
    if (!session) { router.replace("/"); return; }
    const expectedUserId = session.user.id;
    let active = true, busy = false;
    const controller = new AbortController();
    async function check() {
      if (busy || !active) return;
      busy = true;
      try {
        const response = await fetch("/api/session", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (!active) return;
        if ([401, 403, 404].includes(response.status) || response.redirected) { setVerified({ key, sessionKey, portal, state: "denied" }); return; }
        if (!response.ok) throw new Error("Session unavailable");
        const actor = actorSchema.parse(await response.json());
        if (!active) return;
        if (actor.userId !== expectedUserId) { setVerified({ key, sessionKey, portal, state: "denied" }); return; }
        const destination = /^\/admin(\/|$)/.test(pathname) && actor.role === "student" ? "/dashboard"
          : /^\/dashboard(\/|$)/.test(pathname) && actor.role !== "student" ? "/admin" : null;
        if (destination) {
          // The hidden server children cannot deliver their streamed redirect.
          // Navigate only after verifying this account; never reveal the wrong portal.
          setVerified({ key, sessionKey, portal, state: "redirecting" });
          router.replace(destination);
          return;
        }
        setVerified({ key, sessionKey, portal, state: "active", actor });
      } catch { if (active) setVerified({ key, sessionKey, portal, state: "unavailable" }); }
      finally { busy = false; }
    }
    void check();
    const interval = setInterval(() => void check(), 30_000);
    const focus = () => void check();
    window.addEventListener("focus", focus);
    return () => { active = false; controller.abort(); clearInterval(interval); window.removeEventListener("focus", focus); };
  }, [key, sessionKey, portal, isLoaded, pathname, session, router]);
  if (!isLoaded || !session) return <WorkspaceLoading signingOut={isLoaded && !session} />;
  if (verified?.key !== key) {
    // Only the already-verified shell for this exact account and portal may
    // remain. SessionPage withholds the destination page until its fresh check
    // completes. Account/portal switches still hide the entire private tree.
    const keepShell = verified?.state === "active" && verified.sessionKey === sessionKey && verified.portal === portal &&
      (portal !== "student" || verified.actor?.role === "student") &&
      (portal !== "staff" || (verified.actor?.role === "admin" || verified.actor?.role === "employee"));
    return keepShell ? <PageAccess.Provider value={false}>{children}</PageAccess.Provider> : <WorkspaceLoading />;
  }
  if (verified.state === "redirecting") return <WorkspaceLoading />;
  if (verified.state !== "active") return <main className="space-y-4 p-6"><h1>Account access {verified.state === "denied" ? "restricted" : "unavailable"}</h1><p>{verified.state === "denied" ? "Access changed or your session ended. Sign in again or contact an administrator." : "Your session could not be verified. Check your connection and reload. You have not been signed out."}</p><button onClick={() => window.location.reload()}>Reload</button><button onClick={() => void signOut({ redirectUrl: "/sign-in" }).catch(() => {})}>Sign out</button></main>;
  return <PageAccess.Provider value={true}>{children}</PageAccess.Provider>;
}
