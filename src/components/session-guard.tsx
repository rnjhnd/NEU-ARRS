"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession, useClerk } from "@clerk/nextjs";
import { z } from "zod";
import { roleSchema } from "@/lib/role-policy";

const actorSchema = z.object({ userId: z.string().min(1), role: roleSchema }).strict();
export function SessionGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, isLoaded } = useSession();
  const { signOut } = useClerk();
  const protectedPage = /^\/(admin|dashboard|receipt)(\/|$)/.test(pathname);
  const key = (session?.id ?? "anonymous") + ":" + pathname;
  const [verified, setVerified] = useState<{ key: string; state: "active" | "denied" | "unavailable" } | null>(null);
  useEffect(() => {
    if (!protectedPage || !isLoaded) return;
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
        const actor = actorSchema.parse(await response.json());
        if (!active) return;
        const correctPortal = !pathname.startsWith("/admin") || actor.role !== "student";
        const correctStudent = !pathname.startsWith("/dashboard") || actor.role === "student";
        setVerified({ key, state: session && actor.userId === session.user.id && correctPortal && correctStudent ? "active" : "denied" });
      } catch { if (active) setVerified({ key, state: "unavailable" }); }
      finally { busy = false; }
    }
    void check();
    const interval = setInterval(() => void check(), 30_000);
    const focus = () => void check();
    window.addEventListener("focus", focus);
    return () => { active = false; controller.abort(); clearInterval(interval); window.removeEventListener("focus", focus); };
  }, [key, protectedPage, isLoaded, pathname, session]);
  if (!protectedPage) return children;
  if (!isLoaded || verified?.key !== key) return <p role="status" className="p-6">Verifying account access…</p>;
  if (verified.state !== "active") return <main className="space-y-4 p-6"><h1>Account access {verified.state === "denied" ? "restricted" : "unavailable"}</h1><p>{verified.state === "denied" ? "Access changed or your session ended. Sign in again or contact an administrator." : "Your session could not be verified. Check your connection and reload. You have not been signed out."}</p><button onClick={() => window.location.reload()}>Reload</button><button onClick={() => void signOut({ redirectUrl: "/sign-in" }).catch(() => {})}>Sign out</button></main>;
  return children;
}
