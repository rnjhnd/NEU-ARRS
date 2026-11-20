import { StrictMode, useEffect, useLayoutEffect, useReducer, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";
import { AuthFixture, type FixtureUser } from "../navigation-fixture/clerk";
import { usePathname, navigate } from "../navigation-fixture/navigation";
import { RequestForm } from "../../src/app/(student)/dashboard/new/request-form";
import { SessionGuard, SessionPage } from "../../src/components/session-guard";
import { ProfileMenu } from "../../src/components/profile-menu";
import { PageLoading } from "../../src/components/workspace-loading";
import type { PageAccess } from "../../src/lib/page-access-model";
import SignIn from "../../src/app/sign-in/[[...sign-in]]/page";
import SignUp from "../../src/app/sign-up/[[...sign-up]]/page";
import { SSOSessionHandoff } from "../../src/components/sso-session-handoff";
import "../../src/app/globals.css";

const params = new URLSearchParams(location.search);
const screen = params.get("screen") ?? (location.pathname.startsWith("/dashboard/guard-") ? "session" : "request");
const bootstrapRole = params.get("bootstrap");
const initialAccess: PageAccess | null = bootstrapRole === "student" || bootstrapRole === "employee" || bootstrapRole === "admin"
  ? { userId: "student_synthetic", role: bootstrapRole, sessionId: params.get("bootstrap-session") ?? "session_student_synthetic" } : null;
if (screen === "session") history.replaceState(null, "", initialAccess && initialAccess.role !== "student" ? "/admin" : "/dashboard/guard-check");
const initialPath = location.pathname;
const initialUser: FixtureUser = { id: "student_synthetic", firstName: "Synthetic", lastName: "Student", primaryEmailAddress: null, imageUrl: "", publicMetadata: { role: initialAccess?.role ?? "student" } };
// The isolated fixture models an RSC response, not a production page-data API.
function ServerPageFixture() {
  const path = usePathname();
  const [revision, refresh] = useReducer(value => value + 1, 0);
  const [snapshot, setSnapshot] = useState<{ path: string; access?: PageAccess; denied?: boolean } | null>(() => initialAccess ? { path: initialPath, access: initialAccess } : null);
  useLayoutEffect(() => {
    window.addEventListener("popstate", refresh);
    return () => window.removeEventListener("popstate", refresh);
  }, []);
  useEffect(() => {
    if (initialAccess && path === initialPath && revision === 0) return;
    let active = true;
    const controller = new AbortController();
    void fetch("/fixture/page?path=" + encodeURIComponent(path) + "&revision=" + revision, { signal: controller.signal }).then(async response => {
      const access = response.ok ? await response.json() as PageAccess : undefined;
      if (active) setSnapshot({ path, access, denied: !response.ok });
    }).catch(() => { if (active) setSnapshot({ path, denied: true }); });
    return () => { active = false; controller.abort(); };
  }, [path, revision]);
  // Like router.refresh(), a same-route RSC update merges props without
  // unmounting the existing client boundary or restarting its recovery timer.
  if (!snapshot) return <PageLoading />;
  if (snapshot.denied) return <p role="alert">Page access restricted</p>;
  return <SessionPage access={snapshot.access!}><p data-route={snapshot.path}>Verified private content</p></SessionPage>;
}
function ProtectedShell() {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  return <div className="p-4">
    <header className="flex items-center justify-between gap-4 rounded-xl border p-4">
      <h1>{path.startsWith("/admin") ? "Staff workspace" : "Student workspace"}</h1>
      <button onClick={() => setCollapsed(value => !value)}>{collapsed ? "Expand fixture sidebar" : "Collapse fixture sidebar"}</button>
      <ProfileMenu />
    </header>
    <main><ServerPageFixture /></main>
  </div>;
}
function Fixture() {
  const [user, setUser] = useState<FixtureUser | null>(initialUser);
  const [isLoaded, setIsLoaded] = useState(params.get("sdk") !== "pending");
  const path = usePathname();
  return <ThemeProvider attribute="class"><AuthFixture.Provider value={{ user, isLoaded, signOut: async () => { const response = await fetch("/fixture/signout", { method: "POST" }); if (!response.ok) throw new Error("Synthetic sign-out failed"); setUser(null); } }}>
    <nav className="flex flex-wrap gap-3 p-3"><button onClick={() => setUser({ ...initialUser, id: "other_student" })}>Switch student</button><button onClick={() => setUser({ ...initialUser, publicMetadata: { role: "employee" } })}>Change role</button><button onClick={() => navigate(path.startsWith("/admin") ? "/admin/students" : "/dashboard/new")}>Navigate protected</button><button onClick={() => navigate("/admin")}>Navigate staff</button><button onClick={() => navigate("/admin/finance")}>Navigate finance</button><button onClick={() => navigate("/")}>Navigate public</button><button onClick={() => navigate("/dashboard/guard-check")}>Return protected</button></nav>
    {!isLoaded && <button onClick={() => setIsLoaded(true)}>Resolve client session</button>}
    {screen === "session" ? <SessionGuard initialAccess={initialAccess}>{path === "/" ? <p>Public home</p> : path === "/sign-in" ? <SignIn /> : <ProtectedShell />}</SessionGuard> : screen === "signin" ? <SignIn /> : screen === "signup" ? <SignUp /> : screen === "sso" ? <SSOSessionHandoff /> : path === "/dashboard" ? <p>Dashboard reached</p> : <main className="p-4"><RequestForm actorId="student_synthetic" documentConfigs={[{ typeId: "TOR", label: "Transcript", description: "Synthetic official record", price: 15050, isActive: true }]} paymentMethods={{ online: false, cash: true }} initialStudentName="Previous Synthetic Student" initialStudentNumber="21-23456-789" /></main>}
    <Toaster />
  </AuthFixture.Provider></ThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
