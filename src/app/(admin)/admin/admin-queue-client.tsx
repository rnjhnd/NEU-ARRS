"use client";
import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ADMIN_QUEUE_URL, QUEUE_PAGE_SIZE, DEFAULT_QUEUE_QUERY, adminQueueURL, queueExportSchema, queueStatusLabels, mergeQueueChanges, type AdminQueue, type QueueFilter, type QueueItem, type QueueSort, type QueueQuery, type QueueChange } from "@/lib/admin-queue-model";
import { fetchAdminQueue, fetchQueueExport, QueueRefreshError } from "@/lib/admin-queue-fetcher";
import { getStatusChangeError } from "@/lib/request-workflow";
import { QueueTable } from "./queue-table";
import { QueueUpdateDialog, type QueueDialog } from "./queue-update-dialog";
import { useQueueUpdate } from "./use-queue-update";

export function AdminQueueClient({ initialQueue }: { initialQueue: AdminQueue }) {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <p role="status">Verifying staff account...</p>;
  if (user?.id !== initialQueue.actorId || user.publicMetadata.role !== initialQueue.role) return <p role="alert">Your staff account or role changed. Reload the queue before continuing.</p>;
  return <QueueWorkspace key={initialQueue.actorId + ":" + initialQueue.role} initialQueue={initialQueue} />;
}
function QueueWorkspace({ initialQueue }: { initialQueue: AdminQueue }) {
  const { mutate: mutatePages } = useSWRConfig();
  const [query, setQuery] = useState<QueueQuery>(initialQueue.query ?? DEFAULT_QUEUE_QUERY);
  const [search, setSearch] = useState(query.search), [requiresRefresh, setRequiresRefresh] = useState(false), [denied, setDenied] = useState(false);
  const [selection, setSelection] = useState<Map<string, string>>(new Map());
  const [dialog, setDialog] = useState<QueueDialog | null>(null), [reviewPending, setReviewPending] = useState(false);
  const [exportPending, setExportPending] = useState(false), [exportError, setExportError] = useState("");
  const [exportFrom, setExportFrom] = useState(""), [exportTo, setExportTo] = useState("");
  const exportFlight = useRef(false), active = useRef(false), exportController = useRef<AbortController | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(current => current.search === search.trim() ? current : { ...current, page: 1, search: search.trim() }), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const url = adminQueueURL(query);
  const { data, error, isValidating, mutate } = useSWR<AdminQueue, Error>([url, initialQueue.actorId, initialQueue.role] as const, fetchAdminQueue, {
    fallbackData: url === adminQueueURL(initialQueue.query) ? initialQueue : undefined, keepPreviousData: true,
    refreshInterval: current => { const summary = (current ?? initialQueue).summary; return summary.pending + summary.processing + summary.ready > 0 ? 30_000 : 0; },
    refreshWhenHidden: false, refreshWhenOffline: false, revalidateOnFocus: true, revalidateOnReconnect: true, errorRetryCount: 3,
    shouldRetryOnError: error => !(error instanceof QueueRefreshError && [400, 401, 403, 404, 409, 413].includes(error.status)),
    onSuccess: () => setRequiresRefresh(false),
  });
  const queue = data ?? initialQueue;
  const changingQuery = queue.query.page !== Math.min(query.page, queue.totalPages) || queue.query.status !== query.status || queue.query.search !== query.search || queue.query.sort !== query.sort || queue.query.direction !== query.direction || search.trim() !== query.search;
  const sessionValid = !denied && !(error instanceof QueueRefreshError && [401, 403, 404].includes(error.status));
  const blocked = Boolean(error) || requiresRefresh || isValidating || changingQuery;
  useEffect(() => { active.current = sessionValid; return () => { active.current = false; exportController.current?.abort(); }; }, [sessionValid]);
  async function patchPages(changes: QueueChange[]) {
    await mutatePages<AdminQueue>(key => Array.isArray(key) && typeof key[0] === "string" && key[0].startsWith(ADMIN_QUEUE_URL) && key[1] === initialQueue.actorId && key[2] === initialQueue.role,
      current => current ? mergeQueueChanges(current, changes) : current, { revalidate: true });
  }
  const updates = useQueueUpdate({ mutate, blocked, sessionValid, fallbackQueue: queue, onCommitted: () => setSelection(new Map()), requireRefresh: () => setRequiresRefresh(true), patchPages });
  const pending = updates.pending || reviewPending || exportPending;
  const view = { items: queue.items, page: queue.query.page, totalPages: queue.totalPages, total: queue.total };
  const sort: QueueSort = { key: queue.query.sort, direction: queue.query.direction };
  const visible = new Map(view.items.map(item => [item.id, item]));
  const selected = view.items.filter(item => selection.has(item.id));
  const staleSelection = [...selection].some(([id, version]) => visible.get(id)?.updatedAt !== version);
  const counts = queue.summary;
  const refresh = async () => { setExportError(""); try { await mutate(); } catch { /* Retain the last verified page. */ } };
  function toggle(item: QueueItem) { setSelection(current => { const next = new Map(current); if (next.has(item.id)) next.delete(item.id); else next.set(item.id, item.updatedAt); return next; }); }
  function changeSort(key: QueueSort["key"]) {
    if (pending || dialog) return;
    setQuery(current => ({ ...current, page: 1, sort: key, direction: current.sort === key && current.direction === "asc" ? "desc" : "asc" })); setSelection(new Map());
  }
  const canUpdate = (status: QueueItem["status"]) => !blocked && !pending && !staleSelection && selected.length > 0 && selected.every(item => !getStatusChangeError(item, status, { confirmCashCollected: true }));
  async function immediate(status: QueueItem["status"]) { if (canUpdate(status)) await updates.save(selected, { status }); }
  async function exportCSV() {
    if (blocked || pending || exportFlight.current || !queue.summary.total) return;
    const range = queueExportSchema.safeParse({ from: exportFrom || undefined, to: exportTo || undefined });
    if (!range.success) { setExportError("Choose both creation dates in order, or leave both empty to export all."); return; }
    exportFlight.current = true; setExportPending(true); setExportError("");
    const controller = new AbortController(); exportController.current = controller;
    try {
      const result = await fetchQueueExport(initialQueue.actorId, initialQueue.role, range.data, controller.signal);
      if (!active.current) return;
      const download = URL.createObjectURL(new Blob(["\uFEFF", result.csv.replace(/^\uFEFF/, "")], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a"); link.href = download; link.download = "neu_requests_export_" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.append(link);
      try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(download), 1000); }
      if (result.emailLookupFailed) toast.warning("Exported stored request details; some email addresses could not be refreshed.");
    } catch (failure) {
      if (!active.current) return;
      if (failure instanceof QueueRefreshError && [401, 403, 404].includes(failure.status)) setDenied(true);
      else setExportError(failure instanceof QueueRefreshError ? failure.message : "Export could not be confirmed. Retry after refreshing.");
    } finally { exportFlight.current = false; if (active.current) setExportPending(false); }
  }
  if (!sessionValid) return <p role="alert">Your staff session changed. Reload the queue to continue.</p>;
  return <div className="space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[["Pending Action", counts.pending], ["In Processing", counts.processing], ["Ready for Pickup", counts.ready]].map(([label, count]) => <Card key={label}><CardContent className="p-6"><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-bold">{count}</p></CardContent></Card>)}</div>
    {(error || requiresRefresh) && <p role="alert" className="rounded border border-destructive/30 p-4">Queue refresh required. Showing the last verified data and confirmed changes; counts require refresh before another update.{error instanceof QueueRefreshError && error.status === 413 ? " Narrow the search to match fewer profiles." : ""}</p>}
    {changingQuery && <p role="status">Loading the requested view. Previous verified rows remain read-only.</p>}
    {exportError && <p role="alert">{exportError}</p>}
    {queue.emailLookupFailed && <p role="status">Some student email addresses could not be refreshed. Stored names and student numbers remain available.</p>}
    <div className="flex flex-wrap items-center gap-3"><div role="group" aria-label="Filter requests by status" className="flex max-w-full overflow-x-auto gap-1">{(["ALL", ...Object.keys(queueStatusLabels)] as QueueFilter[]).map(value => <Button key={value} size="sm" variant={value === query.status ? "default" : "outline"} aria-pressed={value === query.status} disabled={pending || Boolean(dialog)} onClick={() => { setQuery(current => ({ ...current, status: value, page: 1 })); setSelection(new Map()); }}>{value === "ALL" ? "All" : queueStatusLabels[value]}</Button>)}</div>
      <div className="w-full sm:max-w-sm"><label htmlFor="queue-search" className="sr-only">Search requests</label><Input id="queue-search" placeholder="Search name, email, or ID..." value={search} maxLength={200} disabled={pending || Boolean(dialog)} onChange={event => { setSearch(event.target.value); setSelection(new Map()); }} /></div></div>
    <Card className="overflow-hidden rounded-3xl"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-2xl">Request Queue</CardTitle><CardDescription>Whole-queue counts; ten server-selected rows per page. Active queues refresh every 30 seconds.</CardDescription></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={isValidating || pending} onClick={() => void refresh()}>Refresh queue</Button><Button variant="outline" disabled={blocked || pending || !queue.summary.total} onClick={() => void exportCSV()}>{exportPending ? "Exporting..." : "Export all CSV"}</Button></div></div>
      <fieldset className="flex flex-wrap gap-3 text-sm" disabled={pending}><legend className="mb-2">CSV creation dates (optional, Asia/Manila)</legend><label>From<Input aria-label="CSV creation start date" type="date" value={exportFrom} onChange={event => setExportFrom(event.target.value)} /></label><label>To<Input aria-label="CSV creation end date" type="date" value={exportTo} onChange={event => setExportTo(event.target.value)} /></label><p className="w-full text-xs text-muted-foreground">Exports include all statuses, independent of table search. Maximum 5,000 requests / 5 MB; narrow creation dates for larger histories.</p></fieldset>
      {selection.size > 0 && <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Selected request actions"><span>{selection.size} selected</span><Button size="sm" variant="outline" disabled={pending} onClick={() => setSelection(new Map())}>Clear selection</Button><Button size="sm" disabled={!canUpdate("PROCESSING")} onClick={() => void immediate("PROCESSING")}>Process</Button><Button size="sm" disabled={!canUpdate("READY_FOR_PICKUP")} onClick={() => void immediate("READY_FOR_PICKUP")}>Mark Ready</Button><Button size="sm" disabled={!canUpdate("COMPLETED")} onClick={() => { if (selected.some(item => item.paymentMethod === "cash" && item.paymentStatus === "CASH_ON_PICKUP")) setDialog({ mode: "cash", snapshot: selected }); else void immediate("COMPLETED"); }}>Complete</Button><Button size="sm" variant="destructive" disabled={!canUpdate("CANCELLED")} onClick={() => setDialog({ mode: "cancel", snapshot: selected })}>Cancel</Button>{staleSelection && <p role="alert">Selected requests changed or left this page. Clear and select them again.</p>}</div>}
    </CardHeader><CardContent className="p-0"><QueueTable items={view.items} selection={selection} sort={sort} onSort={changeSort} disabled={pending || blocked || Boolean(dialog)} onToggle={toggle} onTogglePage={() => setSelection(current => view.items.every(item => current.has(item.id)) ? new Map() : new Map(view.items.map(item => [item.id, item.updatedAt])))} onDetails={item => setDialog({ mode: "details", snapshot: [item] })} /></CardContent>
      {view.total > 0 && <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t py-4"><span className="text-sm">Showing {(view.page - 1) * QUEUE_PAGE_SIZE + 1} to {Math.min(view.page * QUEUE_PAGE_SIZE, view.total)} of {view.total} requests</span><nav aria-label="Queue pages" className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={view.page === 1 || pending || Boolean(dialog) || changingQuery} onClick={() => { setQuery(current => ({ ...current, page: view.page - 1 })); setSelection(new Map()); }}>Previous</Button><span>Page {view.page} of {view.totalPages}</span><Button variant="outline" size="sm" disabled={view.page === view.totalPages || pending || Boolean(dialog) || changingQuery} onClick={() => { setQuery(current => ({ ...current, page: view.page + 1 })); setSelection(new Map()); }}>Next</Button></nav></CardFooter>}
    </Card>
    {dialog && <QueueUpdateDialog key={dialog.mode + ":" + dialog.snapshot.map(item => item.id + item.updatedAt).join(",")} dialog={dialog} current={queue.items} canOverride={queue.role === "admin"} pending={pending} blocked={blocked} save={updates.save} onClose={() => { if (!pending) setDialog(null); }} onRefresh={() => void refresh()} onReviewPending={setReviewPending} onReconciled={() => { setRequiresRefresh(true); setDialog(null); void refresh(); }} />}
  </div>;
}
