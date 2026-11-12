import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { canonicalSetting, defaultEmailTemplates, DEFAULT_OPERATIONS, settingDefault, STATUS_KEYS, type SettingEntry } from "@/lib/configuration-model";

export const SETTING_LABELS = { MAINTENANCE_MODE: "Request availability", PAYMENT_METHODS: "Payment methods", OPERATIONS_CONFIG: "Pickup details", EMAIL_TEMPLATES: "Email messages" };
export function SettingEditor({ entry, operations, pending, uncertain, stale, error, onSave, onClose }: { entry: SettingEntry; operations: typeof DEFAULT_OPERATIONS;
  pending: boolean; uncertain: boolean; stale: boolean; error: string; onSave: (form: FormData) => Promise<void>; onClose: () => void }) {
  const [raw, setRaw] = useState(entry.valid && entry.value !== null ? entry.value : settingDefault(entry.key));
  const [status, setStatus] = useState<typeof STATUS_KEYS[number]>("PENDING_PAYMENT"); const [validation, setValidation] = useState("");
  const value = JSON.parse(raw); const locked = pending || uncertain;
  const defaults = defaultEmailTemplates(operations);
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>{SETTING_LABELS[entry.key]}</DialogTitle><DialogDescription>Only confirmed saves change the configuration. Close without saving to discard this draft.</DialogDescription></DialogHeader>
    {!entry.valid && <p role="alert">The stored setting is invalid. These fields show safe defaults for an explicit repair; they are not the current effective configuration.</p>}
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); let canonical: string; try { canonical = canonicalSetting(entry.key, raw); } catch { setValidation("Check the fields and keep at least one payment method enabled. Messages can contain at most 10,000 characters each."); return; }
      const form = new FormData(); form.set("key", entry.key); form.set("value", canonical); form.set("expectedVersion", entry.version ?? ""); setValidation(""); void onSave(form); }}>
      {entry.key === "MAINTENANCE_MODE" && <><label className="flex items-center gap-3"><input type="checkbox" checked={value} disabled={locked} onChange={event => setRaw(JSON.stringify(event.target.checked))} />Pause new document requests</label><p className="text-sm">Existing request history remains available. Existing provider checkout links are not expired by this switch.</p></>}
      {entry.key === "PAYMENT_METHODS" && <fieldset disabled={locked} className="space-y-3"><legend className="mb-3">Available payment methods</legend>{(["online", "cash"] as const).map(method => <label key={method} className="flex items-center gap-3"><input type="checkbox" checked={value[method]} onChange={event => setRaw(JSON.stringify({ ...value, [method]: event.target.checked }))} />{method === "online" ? "Online payment" : "Cash on pickup"}</label>)}</fieldset>}
      {entry.key === "OPERATIONS_CONFIG" && <><div><label htmlFor="pickup-location">Pickup location</label><Input id="pickup-location" required maxLength={500} value={value.location} disabled={locked} onChange={event => setRaw(JSON.stringify({ ...value, location: event.target.value }))} /></div><div><label htmlFor="pickup-hours">Pickup hours</label><Input id="pickup-hours" required maxLength={500} value={value.hours} disabled={locked} onChange={event => setRaw(JSON.stringify({ ...value, hours: event.target.value }))} /></div></>}
      {entry.key === "EMAIL_TEMPLATES" && <><div><label htmlFor="message-status">Request status</label><select id="message-status" className="ml-2 max-w-full rounded border bg-background p-2" value={status} onChange={event => setStatus(event.target.value as typeof status)}>{STATUS_KEYS.map(key => <option key={key} value={key}>{key.replace(/_/g, " ")}</option>)}</select></div>
        <div><label htmlFor="custom-email-text">Custom email text</label><textarea id="custom-email-text" className="mt-1 min-h-32 w-full rounded border bg-background p-2" maxLength={10000} value={value[status] ?? ""} disabled={locked} onChange={event => setRaw(JSON.stringify({ ...value, [status]: event.target.value }))} /></div>
        <p className="text-sm">Plain text only. Leave blank to use the default below. Changes affect future notification snapshots; already queued messages keep their saved content.</p><p className="whitespace-pre-wrap rounded border p-3 text-sm">{defaults[status]}</p></>}
      {(validation || error || stale) && <p role="alert">{validation || error || "This setting changed. Close, refresh, and reopen it before saving."}</p>}
      {uncertain && <p role="status">The outcome is unconfirmed. Retry the same unchanged save or close and refresh before editing again.</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Close</Button><Button type="submit" disabled={pending || stale}>{pending ? "Saving…" : uncertain ? "Retry same save" : "Save setting"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
