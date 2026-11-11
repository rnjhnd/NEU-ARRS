"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStatusChangeError, isAllowedTransition, isStatusReversal } from "@/lib/request-workflow";
import { queueSnapshotChanged, queueStatusLabels, type QueueItem } from "@/lib/admin-queue-model";
import { CancelledPaymentReview } from "./cancelled-payment-review";
import { QueueStatusBadge } from "./queue-table";
import type { SaveQueueUpdate } from "./use-queue-update";

export type QueueDialog = { mode: "details" | "cancel" | "cash"; snapshot: QueueItem[] };
export function QueueUpdateDialog({ dialog, current, canOverride, pending, blocked, save, onClose, onRefresh, onReconciled, onReviewPending }: {
  dialog: QueueDialog; current: QueueItem[]; canOverride: boolean; pending: boolean; blocked: boolean;
  save: SaveQueueUpdate; onClose: () => void; onRefresh: () => void; onReconciled: () => void; onReviewPending: (pending: boolean) => void;
}) {
  const item = dialog.snapshot[0];
  const details = dialog.mode === "details";
  const [status, setStatus] = useState<QueueItem["status"]>(details ? item.status : dialog.mode === "cancel" ? "CANCELLED" : "COMPLETED");
  const [reason, setReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [cashCollected, setCashCollected] = useState(false);
  const [correction, setCorrection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const changed = queueSnapshotChanged(dialog.snapshot, current);
  const override = details && item.status !== status && !isAllowedTransition(item.status, status);
  const cash = dialog.mode === "cash" || cashCollected;
  const policyError = dialog.snapshot.some(row => getStatusChangeError(row, status, { isOverride: override && canOverride, confirmCashCollected: cash }));
  const invalid = blocked || changed || pending || policyError || (status === "CANCELLED" && !reason.trim()) || (override && (!canOverride || overrideReason.trim().length < 5));
  const title = details ? "Request Details" : dialog.mode === "cancel" ? "Cancel Requests" : "Confirm Cash Collection";
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className="sm:max-w-[500px] max-h-[85dvh] overflow-y-auto" showCloseButton={!pending}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{details ? "Review the request and update its status using the permitted workflow." : dialog.mode === "cash" ? "Confirm cash has been collected for every cash-on-pickup request in this selection." : "Provide a reason for cancelling the selected requests."}</DialogDescription></DialogHeader>
      {details && <>
        <QueueStatusBadge status={item.status} />
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 break-words">{[
          ["Reference ID", item.id], ["Student Name", item.studentName], ["Student Number", item.studentNumber], ["Student Email", item.studentEmail ?? "No email available"],
          ["Document", item.documentType], ["Purpose", item.purpose.replace(/_/g, " ")], ["Payment", item.paymentMethod + " / " + item.paymentStatus],
          ["Submitted", format(new Date(item.createdAt), "MMM d, yyyy h:mm a")], ["Last Updated", format(new Date(item.updatedAt), "MMM d, yyyy h:mm a")],
          ["Cancellation reason", item.cancelReason ?? "None"],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm">{value}</dd></div>)}</dl>
        {item.status === "COMPLETED" && <a href={"/receipt/" + item.id} target="_blank" rel="noreferrer" className="text-sm underline">View Official Receipt</a>}
        {canOverride && item.status === "CANCELLED" && item.paymentMethod === "online" && <CancelledPaymentReview request={item} disabled={blocked || changed || pending} onPendingChange={onReviewPending} onReconciled={onReconciled} />}
      </>}
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); if (invalid) return;
        setError(null);
        const result = await save(dialog.snapshot, { status, cancelReason: reason, isOverride: override,
          overrideReason, confirmCashCollected: cash, sendCorrection: override && correction });
        if (!active.current) return;
        if (result.success) onClose(); else setError(result.error);
      }}>
        {details && <div className="space-y-2"><label htmlFor="queue-status" className="text-sm font-semibold">Update Status</label>
          <select id="queue-status" value={status} disabled={pending || changed} className="w-full rounded border bg-background p-2" onChange={event => {
            setStatus(event.target.value as QueueItem["status"]); setCashCollected(false); setCorrection(false);
          }}>{Object.entries(queueStatusLabels).map(([value, label]) => <option key={value} value={value}
              disabled={value !== item.status && Boolean(getStatusChangeError(item, value as QueueItem["status"], { isOverride: canOverride, confirmCashCollected: true }))}>{label}</option>)}</select></div>}
        {status === "CANCELLED" && <div className="space-y-2"><label htmlFor="queue-cancel-reason">Cancellation reason</label>
          <textarea id="queue-cancel-reason" value={reason} maxLength={1000} required disabled={pending} onChange={event => setReason(event.target.value)} className="min-h-24 w-full rounded border p-3" /></div>}
        {override && canOverride && <div className="space-y-2"><label htmlFor="queue-override-reason">Administrator override reason</label>
          <textarea id="queue-override-reason" value={overrideReason} minLength={5} maxLength={1000} required disabled={pending} onChange={event => setOverrideReason(event.target.value)} className="w-full rounded border p-3" /></div>}
        {details && status === "COMPLETED" && item.paymentMethod === "cash" && item.paymentStatus === "CASH_ON_PICKUP" && <label className="flex items-center gap-2"><input type="checkbox" checked={cashCollected} disabled={pending} onChange={event => setCashCollected(event.target.checked)} />I confirm that cash payment has been collected.</label>}
        {override && canOverride && isStatusReversal(item.status, status) && <label className="flex items-center gap-2"><input type="checkbox" checked={correction} disabled={pending} onChange={event => setCorrection(event.target.checked)} />Send correction email for this reversal</label>}
        {changed && <p role="alert">These requests changed. Close and reopen the dialog after refreshing the queue.</p>}
        {blocked && <div role="alert">Refresh the queue before updating a request. <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onRefresh}>Refresh queue</Button></div>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">{canOverride ? "Overrides require a reason and cannot bypass payment eligibility." : "Employees can use normal workflow transitions. Contact an administrator for corrections."}</p>
        <DialogFooter><Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Close</Button>
          <Button type="submit" variant={status === "CANCELLED" ? "destructive" : "default"} disabled={Boolean(invalid)}>{pending ? "Saving..." : details ? "Save Changes" : dialog.mode === "cash" ? "Cash Collected — Complete" : "Confirm Cancellation"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
