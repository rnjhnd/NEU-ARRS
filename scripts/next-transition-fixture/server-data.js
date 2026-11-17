import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache, Suspense } from "react";
import { SessionPage } from "@/components/session-guard";
import { PageShell, PageSkeleton } from "./page-shells";

export const fixtureActor = cache(async () => {
  const role = (await cookies()).get("synthetic_transition_actor")?.value;
  return ["student", "employee", "admin"].includes(role) ? { userId: role + "_fixture", sessionId: "session_" + role + "_fixture", role } : null;
});
const pause = milliseconds => new Promise(done => setTimeout(done, milliseconds));
async function Records({ name }) {
  await pause(1800);
  return <p data-testid="records">{name} records loaded</p>;
}
export async function workspacePage(name, path = "/dashboard", roles = ["student"]) {
  const access = await fixtureActor();
  if (!access) redirect("/sign-in");
  // Keep authorization/data deliberately slow so both transition phases can be observed.
  await pause(1000);
  if (!roles.includes(access.role)) return <p role="alert">Access denied</p>;
  return <SessionPage access={access}>
    <PageShell path={path} loaded><Suspense fallback={<PageSkeleton path={path} />}><Records name={name} /></Suspense></PageShell>
  </SessionPage>;
}
