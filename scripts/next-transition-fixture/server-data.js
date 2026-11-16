import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache, Suspense } from "react";
import { SessionPage } from "@/components/session-guard";

export const fixtureActor = cache(async () => (await cookies()).has("synthetic_transition_actor")
  ? { userId: "student_fixture", sessionId: "session_student_fixture", role: "student" } : null);
const pause = milliseconds => new Promise(done => setTimeout(done, milliseconds));
async function Records({ name }) {
  await pause(600);
  return <p data-testid="records">{name} records loaded</p>;
}
export async function workspacePage(name) {
  const access = await fixtureActor();
  if (!access) redirect("/sign-in");
  // Keep authorization/data deliberately slow so both transition phases can be observed.
  await pause(name === "Reports" ? 650 : 30);
  return <SessionPage access={access}>
    <h1>{name}</h1>
    <Suspense fallback={<p data-testid="data-skeleton">Loading document data</p>}><Records name={name} /></Suspense>
  </SessionPage>;
}
