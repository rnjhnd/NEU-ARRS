import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { Toaster } from "sonner";
import { AuthFixture, type FixtureUser } from "../navigation-fixture/clerk";
import { RequestList } from "../../src/app/(student)/dashboard/request-list";
import { studentHistorySchema, type StudentHistory } from "../../src/lib/student-request-model";
import "../../src/app/globals.css";

function Fixture({ history }: { history: StudentHistory }) {
  const [user, setUser] = useState<FixtureUser>({ id: history.studentId, firstName: "Synthetic", lastName: "Student",
    imageUrl: "", primaryEmailAddress: null, publicMetadata: {} });
  return <AuthFixture.Provider value={{ user, signOut: async () => {} }}>
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <div className="p-6 space-y-6">
        <h1>Isolated student request checks</h1>
        <button onClick={() => setUser({ ...user, id: "user_other" })}>Switch account</button>
        <RequestList history={history} />
      </div>
      <Toaster />
    </SWRConfig>
  </AuthFixture.Provider>;
}
const response = await fetch("/fixture/bootstrap");
const history = studentHistorySchema.parse(await response.json());
const root = document.getElementById("root");
if (!root) throw new Error("Fixture root missing.");
createRoot(root).render(<StrictMode><Fixture history={history} /></StrictMode>);
