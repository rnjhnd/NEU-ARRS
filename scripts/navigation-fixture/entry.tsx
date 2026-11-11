import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { AuthFixture, type FixtureUser } from "./clerk";
import { navigate } from "./navigation";
import { Sidebar } from "../../src/app/(admin)/sidebar";
import { MobileNav } from "../../src/app/(admin)/mobile-nav";
import { ProfileDetails } from "../../src/components/profile-details";
import { ProfileMenu } from "../../src/components/profile-menu";
import { ThemeToggle } from "../../src/components/theme-toggle";
import "../../src/app/globals.css";

const bootstrap = { id: "user_a", name: "Admin Fixture", email: "admin@example.invalid", imageUrl: "", role: "admin" };
function person(role: "admin" | "employee", id: string): FixtureUser {
  return { id, firstName: role === "admin" ? "Admin" : "Employee", lastName: "Fixture",
    primaryEmailAddress: { emailAddress: role + "@example.invalid" }, imageUrl: "", publicMetadata: { role } };
}

function Fixture() {
  const [user, setUser] = useState<FixtureUser | null>(person("admin", "user_a"));
  const [failNext, setFailNext] = useState(false);
  const [signOutCalls, setSignOutCalls] = useState(0);
  const [clicks, setClicks] = useState(0);
  async function signOut() {
    setSignOutCalls(count => count + 1);
    const reject = failNext;
    setFailNext(false);
    await new Promise(done => setTimeout(done, 600));
    if (reject) throw new Error("Synthetic sign-out failure");
    setUser(null);
  }
  return <AuthFixture.Provider value={{ user, signOut }}>
    <ThemeProvider attribute="class" defaultTheme="system">
      <div className="flex min-h-screen">
        <Sidebar serverUser={bootstrap} />
        <main className="flex-1 min-w-0 p-4">
          <header className="flex items-center gap-4">
            <MobileNav serverUser={bootstrap} /><ProfileMenu serverUser={bootstrap} />
            <ProfileDetails serverUser={bootstrap} /><ThemeToggle />
          </header>
          <h1 className="mt-4 font-bold">Navigation verification</h1>
          <p>Synthetic users only; provider and router adapters are mocked.</p>
          <div className="flex flex-wrap gap-2 my-4">
            <button onClick={() => setClicks(count => count + 1)}>Background action</button>
            <button onClick={() => setFailNext(true)}>Fail next sign-out</button>
            <button onClick={() => setUser(person("admin", "user_a"))}>Restore admin</button>
            <button onClick={() => setTimeout(() => setUser(person("employee", "user_b")), 1500)}>Switch account shortly</button>
            <button onClick={() => setTimeout(() => navigate(location.pathname === "/admin/students" ? "/admin" : "/admin/students"), 1500)}>Navigate shortly</button>
          </div>
          <p>Background clicks: <output aria-label="Background clicks">{clicks}</output></p>
          <p>Sign-out attempts: <output aria-label="Sign-out attempts">{signOutCalls}</output></p>
          <p>Authentication: {user ? user.firstName : "Signed out"}</p>
          <div style={{ height: 1800 }}>Scroll area</div>
        </main>
      </div>
    </ThemeProvider>
  </AuthFixture.Provider>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Fixture root missing.");
createRoot(root).render(<StrictMode><Fixture /></StrictMode>);
