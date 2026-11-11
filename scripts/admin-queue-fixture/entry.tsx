import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { Toaster } from "sonner";
import { AuthFixture, type FixtureUser } from "../navigation-fixture/clerk";
import { AdminQueueClient } from "../../src/app/(admin)/admin/admin-queue-client";
import { adminQueueSchema, type AdminQueue } from "../../src/lib/admin-queue-model";
import "../../src/app/globals.css";

function Fixture({ queue }: { queue: AdminQueue }) {
  const [user, setUser] = useState<FixtureUser>({ id: queue.actorId, firstName: "Synthetic", lastName: "Staff", imageUrl: "", primaryEmailAddress: null, publicMetadata: { role: queue.role } });
  return <AuthFixture.Provider value={{ user, signOut: async () => {} }}>
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <div className="p-5 space-y-5"><h1>Isolated staff queue checks</h1>
        <button onClick={() => setUser({ ...user, id: "different_staff" })}>Switch staff account</button>
        <button onClick={() => setUser({ ...user, publicMetadata: { role: "student" } })}>Revoke staff role</button>
        <AdminQueueClient initialQueue={queue} />
      </div><Toaster />
    </SWRConfig>
  </AuthFixture.Provider>;
}
const response = await fetch("/fixture/bootstrap");
const queue = adminQueueSchema.parse(await response.json());
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root.");
createRoot(root).render(<StrictMode><Fixture queue={queue} /></StrictMode>);
