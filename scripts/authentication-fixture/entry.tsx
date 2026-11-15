import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";
import { AuthFixture, type FixtureUser } from "../navigation-fixture/clerk";
import { usePathname, navigate } from "../navigation-fixture/navigation";
import { RequestForm } from "../../src/app/(student)/dashboard/new/request-form";
import { SessionGuard, SessionPage } from "../../src/components/session-guard";
import { ProfileMenu } from "../../src/components/profile-menu";
import SignIn from "../../src/app/sign-in/[[...sign-in]]/page";
import SignUp from "../../src/app/sign-up/[[...sign-up]]/page";
import "../../src/app/globals.css";

const screen = new URLSearchParams(location.search).get("screen") ?? (location.pathname.startsWith("/dashboard/guard-") ? "session" : "request");
if (screen === "session") history.replaceState(null, "", "/dashboard/guard-check");
const initialUser: FixtureUser = { id: "student_synthetic", firstName: "Synthetic", lastName: "Student", primaryEmailAddress: null, imageUrl: "", publicMetadata: { role: "student" } };
function ProtectedShell() {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  return <div className="p-4">
    <header className="flex items-center justify-between gap-4 rounded-xl border p-4">
      <h1>{path.startsWith("/admin") ? "Staff workspace" : "Student workspace"}</h1>
      <button onClick={() => setCollapsed(value => !value)}>{collapsed ? "Expand fixture sidebar" : "Collapse fixture sidebar"}</button>
      <ProfileMenu />
    </header>
    <main><SessionPage><p>Verified private content</p></SessionPage></main>
  </div>;
}
function Fixture() {
  const [user, setUser] = useState<FixtureUser | null>(initialUser);
  const path = usePathname();
  return <ThemeProvider attribute="class"><AuthFixture.Provider value={{ user, signOut: async () => { const response = await fetch("/fixture/signout", { method: "POST" }); if (!response.ok) throw new Error("Synthetic sign-out failed"); setUser(null); } }}>
    <nav className="flex flex-wrap gap-3 p-3"><button onClick={() => setUser({ ...initialUser, id: "other_student" })}>Switch student</button><button onClick={() => setUser({ ...initialUser, publicMetadata: { role: "employee" } })}>Change role</button><button onClick={() => navigate(path.startsWith("/admin") ? "/admin/settings" : "/dashboard/new")}>Navigate protected</button><button onClick={() => navigate("/admin")}>Navigate staff</button><button onClick={() => navigate("/")}>Navigate public</button><button onClick={() => navigate("/dashboard/guard-check")}>Return protected</button></nav>
    {screen === "session" ? <SessionGuard>{path === "/" ? <p>Public home</p> : <ProtectedShell />}</SessionGuard> : screen === "signin" ? <SignIn /> : screen === "signup" ? <SignUp /> : path === "/dashboard" ? <p>Dashboard reached</p> : <main className="p-4"><RequestForm actorId="student_synthetic" documentConfigs={[{ typeId: "TOR", label: "Transcript", description: "Synthetic official record", price: 15050, isActive: true }]} paymentMethods={{ online: false, cash: true }} /></main>}
    <Toaster />
  </AuthFixture.Provider></ThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
