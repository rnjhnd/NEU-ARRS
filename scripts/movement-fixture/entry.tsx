import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { AuthFixture, type FixtureUser } from "../navigation-fixture/clerk";
import { MovementClient } from "../../src/app/(admin)/admin/finance/movements/movement-client";
import { movementDatasetSchema, type MovementDataset } from "../../src/lib/money-movement-model";
import "../../src/app/globals.css";
function Fixture({ data }: { data: MovementDataset }) {
  const [user, setUser] = useState<FixtureUser>({ id: data.actorId, firstName: "Synthetic", lastName: "Admin", imageUrl: "", primaryEmailAddress: null, publicMetadata: { role: "admin" } });
  return <AuthFixture.Provider value={{ user, signOut: async () => {} }}><SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><main className="space-y-4 p-4"><h1>Money Movements</h1><button onClick={() => setUser({ ...user, id: "other_admin" })}>Switch administrator</button><button onClick={() => setUser({ ...user, publicMetadata: { role: "employee" } })}>Revoke administrator role</button><MovementClient actorId={data.actorId} initialData={data} /></main></SWRConfig></AuthFixture.Provider>;
}
const data = movementDatasetSchema.parse(await (await fetch("/fixture/bootstrap")).json());
const root = document.getElementById("root"); if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<StrictMode><Fixture data={data} /></StrictMode>);
