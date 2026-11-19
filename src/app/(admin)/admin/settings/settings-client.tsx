"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, Mail, MapPin, Power, RefreshCw, Settings2 } from "lucide-react";
import { workspaceStyles } from "@/components/workspace-ui";
import { AdminConfigurationSession, useConfigurationRead } from "@/components/admin-configuration-session";
import { CONFIG_URL, DEFAULT_OPERATIONS, type SettingEntry, type SettingsSnapshot } from "@/lib/configuration-model";
import { fetchSettings, type RolesSnapshot } from "@/lib/configuration-fetcher";
import { updateSystemSetting } from "@/app/actions/configuration.actions";
import { SettingEditor, SETTING_LABELS } from "./setting-editor";
import { RoleManagement } from "./role-management";

type Props = { actorId: string; initialSettings?: SettingsSnapshot; initialRoles?: RolesSnapshot };
export function SettingsClient(props: Props) {
  return <AdminConfigurationSession actorId={props.actorId}><div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start"><SettingsControls actorId={props.actorId} initialData={props.initialSettings} /><RoleManagement actorId={props.actorId} initialData={props.initialRoles} /></div></AdminConfigurationSession>;
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
  const icons = { MAINTENANCE_MODE: Power, PAYMENT_METHODS: CreditCard, OPERATIONS_CONFIG: MapPin, EMAIL_TEMPLATES: Mail };
  return <section className="min-w-0 rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
    <div className="p-6 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
      <div className="flex items-center gap-3"><Settings2 aria-hidden="true" className="size-5 text-primary" /><h2 className="text-xl font-bold tracking-tight">System controls</h2></div>
      <p className="mt-1 text-sm text-muted-foreground">Manage request availability and registrar preferences.</p>
      <Button variant="outline" size="sm" className="mt-4 rounded-full" disabled={pending || read.isValidating} onClick={() => void read.refresh()}><RefreshCw aria-hidden="true" className="size-3.5" />Refresh settings</Button>
    </div>
    <div className="p-6 space-y-5">
    {(read.error || !read.data && !read.isValidating) && <p role="alert" className={workspaceStyles.error}>Settings could not be verified. Editing is disabled until a successful refresh.</p>}{saved && <p role="status" className={workspaceStyles.notice}>{saved}</p>}
    {read.data?.entries.map(item => { const Icon = icons[item.key]; return <div key={item.key} className="flex items-start gap-4 border-b border-border/40 pb-5 last:border-0 last:pb-0">
      <div className="rounded-xl bg-primary/10 p-2.5 text-primary shrink-0"><Icon aria-hidden="true" className="size-5" /></div>
      <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{SETTING_LABELS[item.key]}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{!item.valid ? "Invalid stored setting — repair required" : item.version ? "Saved configuration" : "Using documented defaults (not saved)"}</p>
      {item.key === "MAINTENANCE_MODE" && item.valid && <p className="mt-2 text-xs font-medium text-primary">{item.value === "true" ? "New requests paused" : "New requests enabled"}</p>}
      <Button variant="outline" size="sm" className="mt-3 w-full rounded-xl border-primary/20 text-primary hover:bg-primary/5 hover:text-primary" disabled={read.blocked || pending || Boolean(entry)} onClick={() => { setError(""); setEntry(item); }}>Edit {SETTING_LABELS[item.key].toLowerCase()}</Button>
      </div>
    </div>; })}
    </div>
    {entry && <SettingEditor key={entry.key + ":" + entry.version} entry={entry} operations={operations} pending={pending} uncertain={uncertain} error={error}
      stale={read.blocked || read.data?.entries.find(item => item.key === entry.key)?.version !== entry.version} onSave={save} onClose={() => void close()} />}
  </section>;
}
