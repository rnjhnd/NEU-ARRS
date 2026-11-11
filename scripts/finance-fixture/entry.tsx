import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { Toaster } from "sonner";
import { AuthFixture, type FixtureUser } from "../navigation-fixture/clerk";
import { FinanceClient } from "../../src/app/(admin)/admin/finance/finance-client";
import { financeDatasetSchema, type FinanceDataset } from "../../src/lib/finance-model";
import "../../src/app/globals.css";

function Fixture({ actorId, data, unavailable }: { actorId: string; data?: FinanceDataset; unavailable: boolean }) {
  const [user, setUser] = useState<FixtureUser>({ id: actorId, firstName: "Synthetic", lastName: "Admin", primaryEmailAddress: null, imageUrl: "", publicMetadata: { role: "admin" } });
  return <AuthFixture.Provider value={{ user, signOut: async () => {} }}><SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    <div className="p-4 space-y-4"><h1>Isolated finance checks</h1><button onClick={() => setUser({ ...user, id: "other_admin" })}>Switch administrator</button><button onClick={() => setUser({ ...user, publicMetadata: { role: "employee" } })}>Revoke administrator role</button>
      <FinanceClient actorId={actorId} initialData={data} initialError={unavailable ? "Snapshot unavailable." : undefined} /></div><Toaster />
  </SWRConfig></AuthFixture.Provider>;
}
const response = await fetch("/fixture/bootstrap");
const bootstrap: { actorId: string; data?: unknown; unavailable: boolean } = await response.json();
const root = document.getElementById("root"); if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<StrictMode><Fixture actorId={bootstrap.actorId} data={bootstrap.data ? financeDatasetSchema.parse(bootstrap.data) : undefined} unavailable={bootstrap.unavailable} /></StrictMode>);
