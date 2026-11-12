"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminConfigurationSession, useConfigurationRead } from "@/components/admin-configuration-session";
import { CONFIG_URL, documentView, type DocumentsSnapshot } from "@/lib/configuration-model";
import { fetchDocuments } from "@/lib/configuration-fetcher";
import { formatPHP } from "@/lib/money-format";
import { createDocumentConfig, initializeDocumentDefaults, updateDocumentConfig } from "@/app/actions/configuration.actions";
import { DocumentEditor, documentDraft, type DocumentDraft } from "./document-editor";

type Props = { actorId: string; initialData?: DocumentsSnapshot; initialError?: string };
export function DocumentClient(props: Props) {
  return <AdminConfigurationSession actorId={props.actorId}><DocumentsWorkspace {...props} /></AdminConfigurationSession>;
}
function DocumentsWorkspace({ actorId, initialData, initialError }: Props) {
  const read = useConfigurationRead(CONFIG_URL + "documents", actorId, initialData, fetchDocuments);
  const [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const [edit, setEdit] = useState<DocumentDraft | null>(null);
  const [defaults, setDefaults] = useState(false);
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
  async function addDefaults() {
    if (busy.current || read.blocked) return; busy.current = true; setPending(true); setError("");
    try {
      const result = await initializeDocumentDefaults();
      if (!read.session.active.current) return;
      if (!result.success) { if (result.code === "auth") read.session.deny(); setError(result.error); return; }
      setDefaults(false); setSuccess(result.data + " standard document(s) added; existing documents were preserved."); await read.refresh();
    } catch { if (read.session.active.current) setError("The result is unconfirmed. Refresh before continuing; existing standard codes cannot be duplicated."); }
    finally { busy.current = false; if (read.session.active.current) setPending(false); }
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={pending || read.isValidating} onClick={() => void read.refresh()}>Refresh documents</Button>
      <Button disabled={blocked || Boolean(edit)} onClick={() => { setError(""); setEdit(documentDraft()); }}>Add document</Button>
      <Button variant="outline" disabled={blocked || Boolean(edit)} onClick={() => { setError(""); setDefaults(true); }}>Add standard documents</Button></div>
    {(read.error || (!read.data && !read.isValidating)) && <p role="alert">{read.error ? "The catalog could not be refreshed. Existing rows are retained; editing is disabled until a successful refresh." : initialError ?? "The document catalog is unavailable."}</p>}
    {success && <p role="status">{success}</p>}{!edit && error && <p role="alert">{error}</p>}
    {read.data && view && <>
      <p>Configured documents: {read.data.items.length}. Active: {read.data.items.filter(item => item.isActive).length}. Last complete refresh: {read.data.asOf}.</p>
      <label className="block max-w-md">Search documents<Input value={search} maxLength={200} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
      <Table><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead>Price (PHP)</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
        <TableBody>{view.items.map(row => <TableRow key={row.id}><TableCell className="max-w-64 whitespace-normal"><p className="font-semibold">{row.label}</p><p className="text-xs text-muted-foreground">{row.typeId}</p></TableCell><TableCell className="max-w-80 break-words whitespace-normal">{row.description}</TableCell><TableCell>{row.isActive ? "Active" : "Inactive"}</TableCell><TableCell>{formatPHP(row.price)}</TableCell><TableCell><Button variant="outline" disabled={blocked || Boolean(edit)} aria-label={"Edit " + row.label} onClick={() => { setError(""); setEdit(documentDraft(row)); }}>Edit</Button></TableCell></TableRow>)}
          {!view.items.length && <TableRow><TableCell colSpan={5}>{read.data.items.length ? "No documents match your search." : "No documents configured. Add documents or explicitly add the standard catalog."}</TableCell></TableRow>}</TableBody>
      </Table>
      <nav aria-label="Document pages" className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>Previous</Button><p role="status">Page {view.page} of {view.totalPages}; {view.matched} matching documents.</p><Button variant="outline" disabled={view.page >= view.totalPages} onClick={() => setPage(view.page + 1)}>Next</Button></nav>
    </>}
    {edit && <DocumentEditor key={edit.intentId} initial={edit} pending={pending} uncertain={uncertain} error={error}
      stale={Boolean(edit.id && read.data?.items.find(item => item.id === edit.id)?.updatedAt !== edit.expectedVersion) || read.blocked}
      onSave={save} onClose={() => void closeEditor()} />}
    <Dialog open={defaults} onOpenChange={value => { if (!pending) setDefaults(value); }}><DialogContent><DialogHeader><DialogTitle>Add standard documents?</DialogTitle><DialogDescription>This adds missing codes only: TOR (PHP 150), GOOD_MORAL (PHP 50), DIPLOMA (PHP 500), ENROLLMENT (PHP 100). Existing documents and saved request prices are preserved.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setDefaults(false)}>Cancel</Button><Button disabled={blocked} onClick={() => void addDefaults()}>{pending ? "Adding…" : "Confirm standard documents"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
