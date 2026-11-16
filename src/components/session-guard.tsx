"use client";
import { useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, useClerk } from "@clerk/nextjs";
import { pageAccessSchema, sessionActorSchema, type PageAccess, type SessionActor } from "@/lib/page-access-model";
import { PageLoading, WorkspaceLoading } from "@/components/workspace-loading";
import { VerifiedAccess } from "./verified-access";

/** A page may render only for the same session and role that authorized its RSC. */
export function SessionPage({ children, access }: { children: ReactNode; access: PageAccess }) {
  const current = useContext(VerifiedAccess);
  const router = useRouter();
  const pathname = usePathname();
  const parsed = pageAccessSchema.safeParse(access);
  const proof = parsed.success ? parsed.data : null;
  const proofKey = proof ? proof.sessionId + ":" + proof.userId : "invalid";
  const matches = Boolean(current && proof && current.sessionKey === proofKey &&
    current.actor.userId === proof.userId && current.actor.role === proof.role);
  const mismatchKey = [pathname, current?.sessionKey, current?.actor.role, proofKey, proof?.role].join(":");
  const recheck = current?.recheck;
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const attempt = mismatchKey + ":" + retry;

  useEffect(() => {
    if (matches || !recheck) return;
    // A cached RSC for another session/role cannot grant access or replace the
    // current actor. Refresh it and recheck only on this exceptional mismatch.
    recheck();
    router.refresh();
    const timeout = setTimeout(() => setFailed(attempt), 15_000);
    return () => clearTimeout(timeout);
  }, [matches, attempt, recheck, router]);

  if (matches) return children;
  if (failed === attempt) return <div role="alert" className="space-y-3 py-8">
    <p>This page could not be verified. Its content is hidden until access can be confirmed.</p>
    <button onClick={() => setRetry(value => value + 1)}>Retry page</button>
  </div>;
  return <PageLoading />;
}

export function SessionGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Public visits discard verification state; a later private visit starts fresh.
  return /^\/(admin|dashboard|receipt)(\/|$)/.test(pathname) ? <ProtectedSessionGuard>{children}</ProtectedSessionGuard> : children;
}

function ProtectedSessionGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, isLoaded } = useSession();
  const { signOut } = useClerk();
  const sessionId = session?.id, userId = session?.user.id;
  const sessionKey = sessionId && userId ? sessionId + ":" + userId : "anonymous";
  const portal = /^\/admin(\/|$)/.test(pathname) ? "staff" : /^\/dashboard(\/|$)/.test(pathname) ? "student" : "receipt";
  // Navigation inside a portal uses its server-authorized page result. It does
  // not restart this monitor or insert another /api/session waterfall.
  const key = sessionKey + ":" + portal;
  const [revision, setRevision] = useState(0);
  const recheck = useCallback(() => setRevision(value => value + 1), []);
  const [verified, setVerified] = useState<{
    key: string; state: "active" | "denied" | "unavailable"; actor?: SessionActor;
  } | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!sessionId || !userId) { router.replace("/"); return; }
    let active = true, busy = false;
    const controller = new AbortController();
    async function check() {
      if (busy || !active) return;
      busy = true;
      try {
        const response = await fetch("/api/session", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (!active) return;
        if ([401, 403, 404].includes(response.status) || response.redirected) { setVerified({ key, state: "denied" }); return; }
        if (!response.ok) throw new Error("Session unavailable");
        const actor = sessionActorSchema.parse(await response.json());
        if (!active) return;
        if (actor.userId !== userId) { setVerified({ key, state: "denied" }); return; }
        setVerified({ key, state: "active", actor });
      } catch { if (active) setVerified({ key, state: "unavailable" }); }
      finally { busy = false; }
    }
    void check();
    const interval = setInterval(() => void check(), 30_000);
    const wake = () => void check();
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      active = false; controller.abort(); clearInterval(interval);
      window.removeEventListener("focus", wake); window.removeEventListener("online", wake);
    };
  }, [key, isLoaded, sessionId, userId, revision, router]);

  const actor = verified?.key === key && verified.state === "active" ? verified.actor : undefined;
  const destination = actor && portal === "staff" && actor.role === "student" ? "/dashboard"
    : actor && portal === "student" && actor.role !== "student" ? "/admin" : null;
  useEffect(() => { if (destination) router.replace(destination); }, [destination, router]);

  if (!isLoaded || !sessionId || !userId) return <WorkspaceLoading signingOut={isLoaded && !sessionId} />;
  if (verified?.key !== key || destination) return <WorkspaceLoading />;
  if (!actor) return <main className="space-y-4 p-6"><h1>Account access {verified.state === "denied" ? "restricted" : "unavailable"}</h1><p>{verified.state === "denied" ? "Access changed or your session ended. Sign in again or contact an administrator." : "Your session could not be verified. Check your connection and reload. You have not been signed out."}</p><button onClick={() => window.location.reload()}>Reload</button><button onClick={() => void signOut({ redirectUrl: "/sign-in" }).catch(() => {})}>Sign out</button></main>;
  return <VerifiedAccess.Provider value={{ sessionKey, actor, recheck }}>{children}</VerifiedAccess.Provider>;
}
