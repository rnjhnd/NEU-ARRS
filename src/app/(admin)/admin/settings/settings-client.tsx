"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AdminConfigurationSession, useConfigurationRead } from "@/components/admin-configuration-session";
import { CONFIG_URL, DEFAULT_OPERATIONS, type SettingEntry, type SettingsSnapshot } from "@/lib/configuration-model";
import { fetchSettings, type RolesSnapshot } from "@/lib/configuration-fetcher";
import { updateSystemSetting } from "@/app/actions/configuration.actions";
import { SettingEditor, SETTING_LABELS } from "./setting-editor";
import { RoleManagement } from "./role-management";

type Props = { actorId: string; initialSettings?: SettingsSnapshot; initialRoles?: RolesSnapshot };
export function SettingsClient(props: Props) {
  return <AdminConfigurationSession actorId={props.actorId}><div className="space-y-8"><SettingsControls actorId={props.actorId} initialData={props.initialSettings} /><RoleManagement actorId={props.actorId} initialData={props.initialRoles} /></div></AdminConfigurationSession>;
}
function SettingsControls({ actorId, initialData }: { actorId: string; initialData?: SettingsSnapshot }) {
  const read = useConfigurationRead(CONFIG_URL + "settings", actorId, initialData, fetchSettings);
  const [entry, setEntry] = useState<SettingEntry | null>(null);
  const [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState("");
  const busy = useRef(false);
  const opsEntry = read.data?.entries.find(item => item.key === "OPERATIONS_CONFIG");
  const operations: typeof DEFAULT_OPERATIONS = opsEntry?.valid && opsEntry.value ? JSON.parse(opsEntry.value) : DEFAULT_OPERATIONS;
  async function close() {
    if (pending) return; if (uncertain && !await read.refresh()) return;
    if (read.session.active.current) { setEntry(null); setUncertain(false); setError(""); }
  }
  async function save(form: FormData) {
    if (busy.current || read.blocked) return; busy.current = true; setPending(true); setError(""); setSaved("");
    try {
      const result = await updateSystemSetting(form);
      if (!read.session.active.current) return;
      if (!result.success) { if (result.code === "auth") read.session.deny(); setError(result.error); setUncertain(result.code === "unavailable"); return; }
      await read.mutate(current => { const snapshot = current ?? read.data; return snapshot ? { ...snapshot, entries: snapshot.entries.map(item => item.key === result.data.key ? result.data : item) } : snapshot; }, { revalidate: false });
      if (!read.session.active.current) return;
      setEntry(null); setUncertain(false); setSaved(SETTING_LABELS[result.data.key] + " saved.");
    } catch { if (read.session.active.current) { setUncertain(true); setError("Save outcome unconfirmed. Retry the same unchanged save or close and refresh."); } }
    finally { busy.current = false; if (read.session.active.current) setPending(false); }
  }
  return <section className="space-y-4 rounded-2xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">System controls</h2><Button variant="outline" disabled={pending || read.isValidating} onClick={() => void read.refresh()}>Refresh settings</Button></div>
    {(read.error || !read.data && !read.isValidating) && <p role="alert">Settings could not be verified. Editing is disabled until a successful refresh.</p>}{saved && <p role="status">{saved}</p>}
    {read.data?.entries.map(item => <div key={item.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><h3 className="font-semibold">{SETTING_LABELS[item.key]}</h3><p className="text-sm text-muted-foreground">{!item.valid ? "Invalid stored setting — repair required" : item.version ? "Saved configuration" : "Using documented defaults (not saved)"}</p>
      {item.key === "MAINTENANCE_MODE" && item.valid && <p>{item.value === "true" ? "New requests paused" : "New requests enabled"}</p>}</div>
      <Button variant="outline" disabled={read.blocked || pending || Boolean(entry)} onClick={() => { setError(""); setEntry(item); }}>Edit {SETTING_LABELS[item.key].toLowerCase()}</Button>
    </div>)}
    {entry && <SettingEditor key={entry.key + ":" + entry.version} entry={entry} operations={operations} pending={pending} uncertain={uncertain} error={error}
      stale={read.blocked || read.data?.entries.find(item => item.key === entry.key)?.version !== entry.version} onSave={save} onClose={() => void close()} />}
  </section>;
}
