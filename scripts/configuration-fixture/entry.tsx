import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { AuthFixture, type FixtureUser } from "../navigation-fixture/clerk";
import { DocumentClient } from "../../src/app/(admin)/admin/documents/document-client";
import { SettingsClient } from "../../src/app/(admin)/admin/settings/settings-client";
import { documentsSnapshotSchema, settingsSnapshotSchema, type DocumentsSnapshot, type SettingsSnapshot } from "../../src/lib/configuration-model";
import { rolesSnapshotSchema, type RolesSnapshot } from "../../src/lib/configuration-fetcher";
import "../../src/app/globals.css";

function Fixture({ screen, documents, settings, roles }: { screen: string; documents?: DocumentsSnapshot; settings?: SettingsSnapshot; roles?: RolesSnapshot }) {
  const [user, setUser] = useState<FixtureUser>({ id: "admin_synthetic", firstName: "Synthetic", lastName: "Admin", primaryEmailAddress: null, imageUrl: "", publicMetadata: { role: "admin" } });
  useEffect(() => { const switchAccount = () => setUser(current => ({ ...current, id: "other_admin" })); window.addEventListener("synthetic-account-switch", switchAccount); return () => window.removeEventListener("synthetic-account-switch", switchAccount); }, []);
  return <AuthFixture.Provider value={{ user, signOut: async () => {} }}><SWRConfig value={{ provider: () => new Map() }}>
    <main className="space-y-5 p-4"><h1>{screen === "settings" ? "System Settings" : "Document Management"}</h1><div className="flex flex-wrap gap-3"><button onClick={() => setUser({ ...user, id: "other_admin" })}>Switch administrator</button><button onClick={() => setUser({ ...user, publicMetadata: { role: "student" } })}>Revoke administrator role</button></div>
      {screen === "settings" ? <SettingsClient actorId="admin_synthetic" initialSettings={settings} initialRoles={roles} /> : <DocumentClient actorId="admin_synthetic" initialData={documents} />}</main>
  </SWRConfig></AuthFixture.Provider>;
}
const screen = new URLSearchParams(location.search).get("screen") ?? "documents";
const response = await fetch("/fixture/bootstrap"); const bootstrap = await response.json();
const root = document.getElementById("root"); if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<StrictMode><Fixture screen={screen} documents={bootstrap.documents ? documentsSnapshotSchema.parse(bootstrap.documents) : undefined} settings={bootstrap.settings ? settingsSnapshotSchema.parse(bootstrap.settings) : undefined} roles={bootstrap.roles ? rolesSnapshotSchema.parse(bootstrap.roles) : undefined} /></StrictMode>);
