import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createDocumentSchema, updateDocumentSchema, type ConfigDocument } from "@/lib/configuration-model";

export type DocumentDraft = { intentId: string; id?: string; expectedVersion?: string; label: string; description: string; typeId: string; price: string; isActive: string };
export function documentDraft(row?: ConfigDocument): DocumentDraft {
  return { intentId: crypto.randomUUID(), id: row?.id, expectedVersion: row?.updatedAt, typeId: row?.typeId ?? "", label: row?.label ?? "", description: row?.description ?? "",
    price: row ? (row.price / 100).toFixed(2) : "0.00", isActive: String(row?.isActive ?? true) };
}
export function DocumentEditor({ initial, pending, uncertain, stale, error, onSave, onClose }: { initial: DocumentDraft; pending: boolean; uncertain: boolean; stale: boolean; error: string;
  onSave: (form: FormData) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(initial); const [validation, setValidation] = useState("");
  const locked = pending || uncertain;
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{draft.id ? "Edit document" : "Add document"}</DialogTitle><DialogDescription>Prices support exact centavos. Existing document codes and saved request quotes stay unchanged.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault(); const form = new FormData();
        for (const key of ["label", "description", "price", "isActive"] as const) form.set(key, draft[key]);
        if (draft.id) { form.set("id", draft.id); form.set("expectedVersion", draft.expectedVersion!); }
        else { form.set("intentId", draft.intentId); form.set("typeId", draft.typeId); }
        const parsed = (draft.id ? updateDocumentSchema : createDocumentSchema).safeParse(Object.fromEntries(form));
        if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Check the fields."); return; }
        setValidation(""); void onSave(form);
      }}>
        <div><label htmlFor="document-label">Document name</label><Input id="document-label" value={draft.label} maxLength={200} required disabled={locked} onChange={e => setDraft({ ...draft, label: e.target.value })} /></div>
        <div><label htmlFor="document-code">Document code {draft.id ? "(fixed)" : "(optional)"}</label><Input id="document-code" value={draft.typeId} maxLength={64} disabled={locked || Boolean(draft.id)} placeholder="Generated from the document name" onChange={e => setDraft({ ...draft, typeId: e.target.value })} /></div>
        <div><label htmlFor="document-description">Description</label><textarea id="document-description" className="w-full rounded border bg-background p-2" value={draft.description} maxLength={2000} required disabled={locked} onChange={e => setDraft({ ...draft, description: e.target.value })} /></div>
        <div><label htmlFor="document-price">Price (PHP)</label><Input id="document-price" inputMode="decimal" value={draft.price} required maxLength={11} disabled={locked} onChange={e => setDraft({ ...draft, price: e.target.value })} /><p className="text-xs text-muted-foreground">Zero and prices below PHP 1.00 are available for cash requests only.</p></div>
        <div><label htmlFor="document-active">Availability</label><select id="document-active" className="ml-2 rounded border bg-background p-2" value={draft.isActive} disabled={locked} onChange={e => setDraft({ ...draft, isActive: e.target.value })}><option value="true">Active</option><option value="false">Inactive</option></select></div>
        {(validation || error || stale) && <p role="alert">{validation || error || "This document changed. Close this editor, refresh, and reopen it before saving."}</p>}
        {uncertain && <p role="status">The save outcome is uncertain. Retrying sends the same unchanged submission. Closing will refresh the stored configuration.</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Close</Button><Button type="submit" disabled={pending || stale}>{pending ? "Saving…" : uncertain ? "Retry same save" : "Save document"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
