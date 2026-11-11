import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { AuthFixture, type FixtureUser } from "../navigation-fixture/clerk";
import { StudentClient } from "../../src/app/(admin)/admin/students/student-client";
import { directorySchema, type StudentDirectory } from "../../src/lib/student-directory-model";
import "../../src/app/globals.css";

function Fixture({ data, unavailable }: { data?: StudentDirectory; unavailable: boolean }) {
  const [user, setUser] = useState<FixtureUser | null>({ id: "staff_synthetic", firstName: "Synthetic", lastName: "Staff", primaryEmailAddress: null, imageUrl: "", publicMetadata: { role: "employee" } });
  return <AuthFixture.Provider value={{ user, signOut: async () => setUser(null) }}><SWRConfig value={{ provider: () => new Map() }}>
    <main className="space-y-4 p-4"><h1>Student Directory</h1><div className="flex flex-wrap gap-4">
      <button onClick={() => setUser(user ? { ...user, id: "other_staff" } : null)}>Switch staff account</button>
      <button onClick={() => setUser(user ? { ...user, publicMetadata: { role: "student" } } : null)}>Revoke staff role</button>
    </div><StudentClient actorId="staff_synthetic" role="employee" initialData={data} initialError={unavailable ? "Snapshot unavailable." : undefined} /></main>
  </SWRConfig></AuthFixture.Provider>;
}
const response = await fetch("/fixture/bootstrap");
const bootstrap: { data?: unknown; unavailable: boolean } = await response.json();
const root = document.getElementById("root"); if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<StrictMode><Fixture data={bootstrap.data ? directorySchema.parse(bootstrap.data) : undefined} unavailable={bootstrap.unavailable} /></StrictMode>);
