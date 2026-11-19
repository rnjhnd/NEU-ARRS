"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, FileText, Pencil, Plus, RefreshCw, Search, XCircle } from "lucide-react";
import { WorkspaceMetric, workspaceStyles } from "@/components/workspace-ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminConfigurationSession, useConfigurationRead } from "@/components/admin-configuration-session";
import { CONFIG_URL, documentView, type DocumentsSnapshot } from "@/lib/configuration-model";
import { fetchDocuments } from "@/lib/configuration-fetcher";
import { formatPHP } from "@/lib/money-format";
import { createDocumentConfig, updateDocumentConfig } from "@/app/actions/configuration.actions";
import { DocumentEditor, documentDraft, type DocumentDraft } from "./document-editor";

type Props = { actorId: string; initialData?: DocumentsSnapshot; initialError?: string };
export function DocumentClient(props: Props) {
  return <AdminConfigurationSession actorId={props.actorId}><DocumentsWorkspace {...props} /></AdminConfigurationSession>;
}
function DocumentsWorkspace({ actorId, initialData, initialError }: Props) {
  const read = useConfigurationRead(CONFIG_URL + "documents", actorId, initialData, fetchDocuments);
  const [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const [edit, setEdit] = useState<DocumentDraft | null>(null);
  const [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const busy = useRef(false);
  const view = read.data ? documentView(read.data.items, search, page) : null;
  const blocked = read.blocked || pending;
  async function closeEditor() {
    if (pending) return;
    if (uncertain && !await read.refresh()) return;
    if (!read.session.active.current) return;
    setEdit(null); setUncertain(false); setError("");
  }
  async function save(form: FormData) {
    if (busy.current || read.blocked) return;
    busy.current = true; setPending(true); setError(""); setSuccess("");
    try {
      const result = await (edit?.id ? updateDocumentConfig(form) : createDocumentConfig(form));
      if (!read.session.active.current) return;
      if (!result.success) { if (result.code === "auth") read.session.deny(); setError(result.error); setUncertain(result.code === "unavailable"); return; }
      await read.mutate(current => { const snapshot = current ?? read.data; return snapshot ? { ...snapshot, items: [...snapshot.items.filter(item => item.id !== result.data.id), result.data] } : snapshot; }, { revalidate: false });
      if (!read.session.active.current) return;
      setEdit(null); setUncertain(false); setSuccess("Document saved. Existing request prices remain unchanged.");
    } catch { if (read.session.active.current) { setError("Save outcome unconfirmed. Retry the same save or close and refresh before editing."); setUncertain(true); } }
    finally { busy.current = false; if (read.session.active.current) setPending(false); }
  }
  const controls = <div className="flex flex-wrap gap-3"><Button variant="outline" className={workspaceStyles.button} disabled={pending || read.isValidating} onClick={() => void read.refresh()}><RefreshCw aria-hidden="true" className={"size-4 " + (read.isValidating ? "animate-spin" : "")} />Refresh documents</Button>
    <Button className={workspaceStyles.button + " bg-primary/10 hover:bg-primary/20 text-primary shadow-none"} disabled={blocked || Boolean(edit)} onClick={() => { setError(""); setEdit(documentDraft()); }}><Plus aria-hidden="true" className="size-4" />Add document</Button></div>;
  return <div className="space-y-8 w-full">
    {!read.data && controls}
    {(read.error || (!read.data && !read.isValidating)) && <p role="alert" className={workspaceStyles.error}>{read.error ? "The catalog could not be refreshed. Existing rows are retained; editing is disabled until a successful refresh." : initialError ?? "The document catalog is unavailable."}</p>}
    {success && <p role="status" className={workspaceStyles.notice}>{success}</p>}{!edit && error && <p role="alert" className={workspaceStyles.error}>{error}</p>}
    {read.data && view && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <WorkspaceMetric label="Total Documents" value={read.data.items.length} icon={FileText} tone="slate" />
        <WorkspaceMetric label="Active" value={read.data.items.filter(item => item.isActive).length} icon={CheckCircle2} />
        <WorkspaceMetric label="Inactive" value={read.data.items.filter(item => !item.isActive).length} icon={XCircle} tone="gold" />
      </div>
      <Card className={workspaceStyles.card}>
        <CardHeader className={workspaceStyles.header}>
          <div><CardTitle className="text-xl font-bold tracking-tight">Document Management</CardTitle><CardDescription className="mt-1">Manage document pricing and availability for student requests.</CardDescription></div>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64 group"><label htmlFor="document-search" className="sr-only">Search documents</label><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="document-search" className={workspaceStyles.search} placeholder="Search documents..." value={search} maxLength={200} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
            {controls}
          </div>
        </CardHeader>
        <CardContent className="p-0"><Table className="table-fixed min-w-[1000px]"><TableHeader><TableRow className="border-b border-border/50 hover:bg-transparent"><TableHead className="pl-8 w-[25%] py-4">Document</TableHead><TableHead className="w-[35%]">Description</TableHead><TableHead className="w-[15%]">Status</TableHead><TableHead className="w-[15%] text-right">Price (PHP)</TableHead><TableHead className="pr-8 w-[10%] text-right">Action</TableHead></TableRow></TableHeader>
          <TableBody>{view.items.map(row => <TableRow key={row.id} className="group border-b border-border/40 last:border-0 hover:bg-primary/5 transition-colors"><TableCell className="pl-8 py-4 whitespace-normal"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary shrink-0"><FileText aria-hidden="true" className="size-5" /></div><div className="min-w-0"><p className="font-semibold break-words">{row.label}</p><p className="text-xs text-muted-foreground break-words">{row.typeId}</p></div></div></TableCell><TableCell className="py-4 break-words whitespace-normal text-muted-foreground">{row.description}</TableCell><TableCell><span className={"inline-flex rounded-full px-3 py-1 text-xs font-semibold border whitespace-nowrap " + (row.isActive ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border")} >{row.isActive ? "Active" : "Inactive"}</span></TableCell><TableCell className="text-right font-semibold">{formatPHP(row.price)}</TableCell><TableCell className="pr-8 text-right"><Button variant="ghost" size="sm" className="rounded-full text-primary hover:bg-primary/10" disabled={blocked || Boolean(edit)} aria-label={"Edit " + row.label} onClick={() => { setError(""); setEdit(documentDraft(row)); }}><Pencil aria-hidden="true" className="size-4" />Edit</Button></TableCell></TableRow>)}
            {!view.items.length && <TableRow><TableCell colSpan={5} className="h-48 text-center text-muted-foreground">{read.data.items.length ? "No documents match your search." : "No documents configured. Add documents or explicitly add the standard catalog."}</TableCell></TableRow>}</TableBody>
        </Table></CardContent>
        <nav aria-label="Document pages" className={workspaceStyles.footer}><Button variant="outline" className="rounded-full min-w-24" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>Previous</Button><p role="status" className="text-sm text-muted-foreground text-center">Page {view.page} of {view.totalPages}; {view.matched} matching documents.</p><Button variant="outline" className="rounded-full min-w-24" disabled={view.page >= view.totalPages} onClick={() => setPage(view.page + 1)}>Next</Button></nav>
      </Card>
    </>}
    {edit && <DocumentEditor key={edit.intentId} initial={edit} pending={pending} uncertain={uncertain} error={error}
      stale={Boolean(edit.id && read.data?.items.find(item => item.id === edit.id)?.updatedAt !== edit.expectedVersion) || read.blocked}
      onSave={save} onClose={() => void closeEditor()} />}
  </div>;
}
