"use client";

import { useEffect, useRef, useState } from "react";
import { recordMovementDate } from "@/app/actions/money-date.actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatPHP } from "@/lib/money-format";
import type { MoneyMovement } from "@/lib/money-movement-model";

export function DateReviewDialog({ movement, disabled, onClose, onPending, onSaved }: {
  movement: MoneyMovement; disabled: boolean; onClose: () => void; onPending: (pending: boolean) => void; onSaved: () => void;
}) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef(false), active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="max-h-[85dvh] overflow-y-auto" showCloseButton={!pending}>
    <DialogHeader><DialogTitle>Record evidenced transaction date</DialogTitle><DialogDescription>Inspect the original receipt or successful provider transaction. Record when the movement actually occurred. This date cannot be overwritten.</DialogDescription></DialogHeader>
    <div className="space-y-1 text-sm"><p className="break-all font-mono text-xs">{movement.requestId}</p><p>{movement.kind === "COLLECTION" ? "Collection" : "Refund"} · <span className="whitespace-nowrap">{formatPHP(movement.amountCentavos)}</span></p></div>
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); if (disabled || flight.current || !date || !checked || reason.trim().length < 10) return;
      const occurredAt = new Date(date + "+08:00");
      if (!Number.isFinite(occurredAt.getTime())) { setError("Enter a valid Manila date and time."); return; }
      flight.current = true; setPending(true); onPending(true); setError("");
      try {
        const form = new FormData(); Object.entries({ requestId: movement.requestId, kind: movement.kind, version: movement.version,
          occurredAt: occurredAt.toISOString(), reason, evidenceChecked: "true" }).forEach(([key, value]) => form.set(key, value));
        const result = await recordMovementDate(form);
        if (!active.current) return;
        if (result.success) onSaved(); else setError(result.error ?? "Refresh before retrying.");
      } catch { if (active.current) setError("Date review could not be confirmed. Refresh before retrying."); }
      finally { flight.current = false; if (active.current) setPending(false); onPending(false); }
    }}>
      <div className="space-y-1"><label htmlFor="movement-occurred-at">Actual occurrence date/time (Manila UTC+08)</label><input id="movement-occurred-at" type="datetime-local" required value={date} disabled={disabled || pending} onChange={event => setDate(event.target.value)} className="block w-full rounded border bg-background p-2" /></div>
      <div className="space-y-1"><label htmlFor="movement-evidence-reason">Original evidence reference or review reason</label><textarea id="movement-evidence-reason" required minLength={10} maxLength={500} value={reason} disabled={disabled || pending} onChange={event => setReason(event.target.value)} className="w-full rounded border bg-background p-2" /></div>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={checked} disabled={disabled || pending} onChange={event => setChecked(event.target.checked)} />I inspected the original evidence and confirmed this actual occurrence time.</label>
      <p className="text-xs">Do not use request-edit, verification or refund-request time as a substitute. Do not include sensitive document contents or credentials in the reference.</p>
      {disabled && <p role="alert">The report changed or needs refresh. Close this dialog and review the current movement.</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Close</Button><Button type="submit" disabled={disabled || pending || !checked || !date || reason.trim().length < 10}>{pending ? "Recording..." : "Record evidenced date"}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
