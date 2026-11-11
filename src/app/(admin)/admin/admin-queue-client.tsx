"use client";

import { useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ADMIN_QUEUE_URL, QUEUE_PAGE_SIZE, queueCSV, queueStatusLabels, queueView, type AdminQueue, type QueueFilter, type QueueItem, type QueueSort } from "@/lib/admin-queue-model";
import { fetchAdminQueue, QueueRefreshError } from "@/lib/admin-queue-fetcher";
import { getStatusChangeError } from "@/lib/request-workflow";
import { QueueTable } from "./queue-table";
import { QueueUpdateDialog, type QueueDialog } from "./queue-update-dialog";
import { useQueueUpdate } from "./use-queue-update";

export function AdminQueueClient({ initialQueue }: { initialQueue: AdminQueue }) {
  const { user, isLoaded } = useUser();
  if (isLoaded && (user?.id !== initialQueue.actorId || user.publicMetadata.role !== initialQueue.role)) {
    return <p role="alert">Your staff account or role changed. Reload the queue before continuing.</p>;
  }
  return <QueueWorkspace key={initialQueue.actorId + ":" + initialQueue.role} initialQueue={initialQueue} />;
}
function QueueWorkspace({ initialQueue }: { initialQueue: AdminQueue }) {
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const { data: queue = initialQueue, error, isValidating, mutate } = useSWR<AdminQueue, Error>(
    [ADMIN_QUEUE_URL, initialQueue.actorId, initialQueue.role] as const, fetchAdminQueue, {
      fallbackData: initialQueue, refreshInterval: 30_000, refreshWhenHidden: false, refreshWhenOffline: false,
      revalidateOnFocus: true, revalidateOnReconnect: true, errorRetryCount: 3,
      shouldRetryOnError: error => !(error instanceof QueueRefreshError && [400, 401, 403, 409].includes(error.status)),
      onSuccess: () => setRequiresRefresh(false),
    });
  const [selection, setSelection] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<QueueFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<QueueSort>({ key: "updatedAt", direction: "desc" });
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<QueueDialog | null>(null);
  const [reviewPending, setReviewPending] = useState(false);
  const sessionValid = !(error instanceof QueueRefreshError && [401, 403].includes(error.status));
  const blocked = Boolean(error) || requiresRefresh || isValidating;
  const updates = useQueueUpdate(mutate, blocked, sessionValid, () => setSelection(new Map()), () => setRequiresRefresh(true));
  const pending = updates.pending || reviewPending;
  const view = useMemo(() => queueView(queue.items, filter, search, sort, page), [queue.items, filter, search, sort, page]);
  const visible = new Map(view.items.map(item => [item.id, item]));
  const selected = view.items.filter(item => selection.has(item.id));
  const staleSelection = [...selection].some(([id, version]) => visible.get(id)?.updatedAt !== version);
  const counts = useMemo(() => queue.items.reduce((counts, item) => {
    if (item.status === "PENDING_PAYMENT") counts.pending++;
    if (item.status === "PROCESSING") counts.processing++;
    if (item.status === "READY_FOR_PICKUP") counts.ready++;
    return counts;
  }, { pending: 0, processing: 0, ready: 0 }), [queue.items]);
  const refresh = async () => { try { await mutate(); } catch { /* Error is displayed by SWR; last verified rows remain. */ } };
  function toggle(item: QueueItem) {
    setSelection(current => { const next = new Map(current); if (next.has(item.id)) next.delete(item.id); else next.set(item.id, item.updatedAt); return next; });
  }
  function changeSort(key: QueueSort["key"]) {
    if (pending || dialog) return;
    setSort(current => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
    setPage(1); setSelection(new Map());
  }
  const canUpdate = (status: QueueItem["status"]) => !blocked && !pending && !staleSelection && selected.length > 0 &&
    selected.every(item => !getStatusChangeError(item, status, { confirmCashCollected: true }));
  async function immediate(status: QueueItem["status"]) {
    if (!canUpdate(status)) return;
    await updates.save(selected, { status });
  }
  function exportCSV() {
    if (blocked || pending || !queue.items.length) return;
    const url = URL.createObjectURL(new Blob(["\uFEFF" + queueCSV(queue.items)], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url; link.download = "neu_requests_export_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.append(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  if (!sessionValid) return <p role="alert">Your staff session changed. Reload the queue to continue.</p>;
  return <div className="space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[
      ["Pending Action", counts.pending], ["In Processing", counts.processing], ["Ready for Pickup", counts.ready],
    ].map(([label, count]) => <Card key={label}><CardContent className="p-6"><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-bold">{count}</p></CardContent></Card>)}</div>
    {(error || requiresRefresh) && <p role="alert" className="rounded border border-destructive/30 p-4">Queue refresh required. Showing the last verified data and confirmed changes; refresh before another update.</p>}
    {queue.emailLookupFailed && <p role="status">Some student email addresses could not be refreshed. Stored names and student numbers remain available.</p>}
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Filter requests by status" className="flex max-w-full overflow-x-auto gap-1">{(["ALL", ...Object.keys(queueStatusLabels)] as QueueFilter[]).map(value =>
        <Button key={value} size="sm" variant={value === filter ? "default" : "outline"} aria-pressed={value === filter} disabled={pending || Boolean(dialog)} onClick={() => { setFilter(value); setPage(1); setSelection(new Map()); }}>{value === "ALL" ? "All" : queueStatusLabels[value]}</Button>)}</div>
      <div className="w-full sm:max-w-sm"><label htmlFor="queue-search" className="sr-only">Search requests</label><Input id="queue-search" placeholder="Search name, email, or ID..." value={search} disabled={pending || Boolean(dialog)}
        onChange={event => { setSearch(event.target.value); setPage(1); setSelection(new Map()); }} /></div>
    </div>
    <Card className="overflow-hidden rounded-3xl">
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-2xl">Active Request Queue</CardTitle><CardDescription>Refreshes every 30 seconds while visible and online.</CardDescription></div>
        <div className="flex gap-2"><Button variant="outline" disabled={isValidating || pending} onClick={() => void refresh()}>Refresh queue</Button><Button variant="outline" disabled={blocked || pending || !queue.items.length} onClick={exportCSV}>Export all CSV</Button></div></div>
        {selection.size > 0 && <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Selected request actions">
          <span>{selection.size} selected</span><Button size="sm" variant="outline" disabled={pending} onClick={() => setSelection(new Map())}>Clear selection</Button>
          <Button size="sm" disabled={!canUpdate("PROCESSING")} onClick={() => void immediate("PROCESSING")}>Process</Button>
          <Button size="sm" disabled={!canUpdate("READY_FOR_PICKUP")} onClick={() => void immediate("READY_FOR_PICKUP")}>Mark Ready</Button>
          <Button size="sm" disabled={!canUpdate("COMPLETED")} onClick={() => {
            if (selected.some(item => item.paymentMethod === "cash" && item.paymentStatus === "CASH_ON_PICKUP")) setDialog({ mode: "cash", snapshot: selected });
            else void immediate("COMPLETED");
          }}>Complete</Button>
          <Button size="sm" variant="destructive" disabled={!canUpdate("CANCELLED")} onClick={() => setDialog({ mode: "cancel", snapshot: selected })}>Cancel</Button>
          {staleSelection && <p role="alert">Selected requests changed or left this page. Clear and select them again.</p>}
        </div>}
      </CardHeader>
      <CardContent className="p-0"><QueueTable items={view.items} selection={selection} sort={sort} onSort={changeSort} disabled={pending || blocked || Boolean(dialog)}
        onToggle={toggle} onTogglePage={() => setSelection(current => view.items.every(item => current.has(item.id)) ? new Map() : new Map(view.items.map(item => [item.id, item.updatedAt])))}
        onDetails={item => setDialog({ mode: "details", snapshot: [item] })} /></CardContent>
      {view.total > 0 && <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t py-4">
        <span className="text-sm">Showing {(view.page - 1) * QUEUE_PAGE_SIZE + 1} to {Math.min(view.page * QUEUE_PAGE_SIZE, view.total)} of {view.total} requests</span>
        <nav aria-label="Queue pages" className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={view.page === 1 || pending || Boolean(dialog)} onClick={() => { setPage(view.page - 1); setSelection(new Map()); }}>Previous</Button>
          <span>Page {view.page} of {view.totalPages}</span><Button variant="outline" size="sm" disabled={view.page === view.totalPages || pending || Boolean(dialog)} onClick={() => { setPage(view.page + 1); setSelection(new Map()); }}>Next</Button></nav>
      </CardFooter>}
    </Card>
    {dialog && <QueueUpdateDialog key={dialog.mode + ":" + dialog.snapshot.map(item => item.id + item.updatedAt).join(",")} dialog={dialog} current={queue.items} canOverride={queue.role === "admin"}
      pending={pending} blocked={blocked} save={updates.save} onClose={() => { if (!pending) setDialog(null); }} onRefresh={() => void refresh()}
      onReviewPending={setReviewPending} onReconciled={() => { setRequiresRefresh(true); setDialog(null); void refresh(); }} />}
  </div>;
}
