"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryNotification, wakeNotificationWorker } from "@/app/actions/notification.actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Row = { id: string; requestId: string; status: string; state: string; attempts: number; lastError: string | null; updatedAt: string; createdAt: string; firstAttemptAt: string | null };
function RetryForm({ row, refreshed }: { row: Row; refreshed: () => void }) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className="flex flex-wrap gap-2" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(); data.set("id", row.id); data.set("version", row.updatedAt); data.set("reason", reason);
    startTransition(async () => {
      try { const result = await retryNotification(data); if (result.success) { toast.success(result.message); refreshed(); } else toast.warning(result.message); }
      catch { toast.error("Recovery could not be confirmed. Refresh before trying again."); }
    });
  }}>
    <label className="sr-only" htmlFor={`reason-${row.id}`}>Reason for retry</label>
    <input id={`reason-${row.id}`} value={reason} onChange={event => setReason(event.target.value)} minLength={5} maxLength={1000} required disabled={pending} placeholder="Reason for retry" className="rounded border p-2" />
    <Button type="submit" disabled={pending || reason.trim().length < 5}>Retry safely</Button>
  </form>;
}
export function NotificationQueue({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2"><Button disabled={pending} onClick={() => startTransition(async () => {
      try { const result = await wakeNotificationWorker(); if (result.success) toast.success("Delivery worker scheduled."); else toast.error("Administrator access required."); router.refresh(); }
      catch { toast.error("Worker wake-up could not be confirmed."); }
    })}>Run due notifications</Button>
    <Button variant="outline" onClick={() => router.refresh()}>Refresh delivery results</Button></div>
    <p className="text-sm text-muted-foreground">Retries preserve the original email. Uncertain sends older than 23 hours require Resend reconciliation; they cannot be recreated here.</p>
    {rows.length === 0 && <p>No pending notifications.</p>}
    {rows.map(row => <article key={row.id} className="space-y-2 rounded-xl border p-4">
      <p className="font-semibold">Request {row.requestId} — {row.status.replace(/_/g, " ")}</p>
      <p>{row.state} · attempts {row.attempts} · queued {row.createdAt}</p>
      {row.firstAttemptAt && <p className="text-sm">First send attempt: {row.firstAttemptAt}</p>}
      {row.lastError && <p className="text-sm">Review code: {row.lastError}</p>}
      {["QUEUED", "REVIEW"].includes(row.state) && <RetryForm row={row} refreshed={() => router.refresh()} />}
    </article>)}
  </div>;
}
