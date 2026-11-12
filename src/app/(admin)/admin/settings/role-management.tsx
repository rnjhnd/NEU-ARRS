"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfigurationRead } from "@/components/admin-configuration-session";
import { CONFIG_URL } from "@/lib/configuration-model";
import { fetchRoles, type RolesSnapshot } from "@/lib/configuration-fetcher";
import { updateUserRole, resumeRoleChange } from "@/app/actions/admin.actions";

type Role = "admin" | "employee" | "student";
export function RoleManagement({ actorId, initialData }: { actorId: string; initialData?: RolesSnapshot }) {
  const read = useConfigurationRead(CONFIG_URL + "roles", actorId, initialData, fetchRoles);
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("all"), [requestedPage, setPage] = useState(1);
  const [change, setChange] = useState<{ id: string; name: string; previous: Role; next: Role; intentId: string; roleVersion: string } | null>(null);
  const [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState("");
  const busy = useRef(false);
  const matches = read.data?.users.filter(user => (filter === "all" || user.role === filter) && (user.name + " " + (user.email ?? "")).toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  const totalPages = Math.max(1, Math.ceil(matches.length / 7)), page = Math.min(requestedPage, totalPages);
  async function refresh() { const result = await read.refresh(); if (result && read.session.active.current) { setUncertain(false); setChange(null); setError(""); } }
  async function save() {
    if (!change || read.blocked || uncertain || busy.current) return; busy.current = true; setPending(true); setError("");
    try {
      const result = await updateUserRole(change.id, change.next, change.previous, change.intentId, change.roleVersion);
      if (!read.session.active.current) return;
      if (!result.success) { if (result.code === "auth") read.session.deny(); setError(result.error); setUncertain(result.code === "unavailable"); return; }
      setChange(null); const fresh = await read.refresh(); if (!fresh && read.session.active.current) { setUncertain(true); setError("The role save was confirmed, but the latest account list is unavailable. Refresh before another change."); }
    } catch { if (read.session.active.current) { setUncertain(true); setError("Role change outcome unconfirmed. Refresh the account list and review active sessions before another change."); } }
    finally { busy.current = false; if (read.session.active.current) setPending(false); }
  }
  async function recover() {
    if (!read.data?.operation || read.blocked || busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await resumeRoleChange(read.data.operation.id);
      if (!read.session.active.current) return;
      if (!result.success && result.code === "auth") { read.session.deny(); return; }
      setError(result.success ? "Role recovery completed." : result.error);
      const fresh = await read.refresh();
      if (fresh && read.session.active.current) { setUncertain(false); setChange(null); }
    } catch { if (read.session.active.current) setError("Recovery could not be confirmed. Refresh accounts and resume the same recorded operation."); }
    finally { busy.current = false; if (read.session.active.current) setPending(false); }
  }
  const observed = change && read.data?.users.find(user => user.id === change.id);
  const stale = change && (!observed || observed.role !== change.previous || observed.roleVersion !== change.roleVersion);
  return <section className="space-y-4 rounded-2xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Role management</h2><Button variant="outline" disabled={pending || read.isValidating} onClick={() => void refresh()}>Refresh accounts</Button></div>
    <p className="text-sm">A confirmed change may require the user to sign in again. Your own administrator role cannot be changed here.</p>
    {read.data?.operation && <div className="space-y-2 rounded border p-3" role="status"><p>A role operation is awaiting recovery ({read.data.operation.stage}). New role changes are disabled. Recovery may repeat its identical metadata write and revoke remaining sessions.</p><p>Account: {read.data.users.find(user => user.id === read.data!.operation!.targetId)?.name ?? read.data.operation.targetId}. Requested change: {read.data.operation.previousRole} to {read.data.operation.nextRole}.</p><Button variant="outline" disabled={pending || read.blocked} onClick={() => void recover()}>Resume role recovery</Button></div>}
    {(read.error || !read.data && !read.isValidating) && <p role="alert">The complete account list is unavailable. Role changes are disabled until refresh succeeds.</p>}{error && <p role="alert">{error}</p>}
    {read.data && <><div className="flex flex-wrap gap-3"><label>Search accounts<Input value={search} maxLength={320} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label><label>Filter role<select className="ml-2 rounded border bg-background p-2" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="all">All roles</option>{["admin", "employee", "student", "unknown"].map(role => <option key={role} value={role}>{role}</option>)}</select></label></div>
      <Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Role</TableHead><TableHead>Action</TableHead></TableRow></TableHeader><TableBody>{matches.slice((page - 1) * 7, page * 7).map(user => <RoleRow key={user.id + ":" + user.role + ":" + user.roleVersion} user={user} disabled={read.blocked || pending || uncertain || Boolean(read.data?.operation) || user.blocked || user.id === actorId || user.role === "unknown"} onChange={next => { if (user.role !== "unknown") { setError(""); setChange({ id: user.id, name: user.name, previous: user.role, next, intentId: crypto.randomUUID(), roleVersion: user.roleVersion }); } }} />)}
        {!matches.length && <TableRow><TableCell colSpan={3}>No accounts match these filters.</TableCell></TableRow>}</TableBody></Table>
      <nav aria-label="Account pages" className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><p role="status">Page {page} of {totalPages}; {matches.length} matching accounts.</p><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button></nav></>}
    <Dialog open={Boolean(change)} onOpenChange={open => { if (!open && !pending) setChange(null); }}><DialogContent><DialogHeader><DialogTitle>Confirm role change</DialogTitle><DialogDescription>Change {change?.name} from {change?.previous} to {change?.next}?</DialogDescription></DialogHeader>{stale && <p role="alert">The account role changed. Refresh before continuing.</p>}{error && <p role="alert">{error}</p>}<DialogFooter><Button variant="outline" disabled={pending} onClick={() => setChange(null)}>Cancel</Button><Button disabled={read.blocked || pending || uncertain || Boolean(stale)} onClick={() => void save()}>{pending ? "Saving…" : "Confirm role"}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
function RoleRow({ user, disabled, onChange }: { user: RolesSnapshot["users"][number]; disabled: boolean; onChange: (role: Role) => void }) {
  const [role, setRole] = useState<Role>(user.role === "unknown" ? "student" : user.role);
  return <TableRow><TableCell className="whitespace-normal"><p>{user.name}</p><p className="text-xs text-muted-foreground">{user.email ?? "No primary email"}</p></TableCell><TableCell><p className="mb-1 text-xs text-muted-foreground">Last verified role: {user.role}</p><select aria-label={"Role for " + user.name} className="rounded border bg-background p-2" value={user.role === "unknown" ? "unknown" : role} disabled={disabled} onChange={event => setRole(event.target.value as Role)}>{user.role === "unknown" && <option value="unknown">Unknown — review required</option>}{["student", "employee", "admin"].map(value => <option key={value} value={value}>{value}</option>)}</select></TableCell><TableCell><Button variant="outline" disabled={disabled || role === user.role} onClick={() => onChange(role)}>Save role</Button></TableCell></TableRow>;
}
