"use client";

import { useEffect, useRef, useState } from "react";
import type { Request } from "@prisma/client";
import { useUser } from "@clerk/nextjs";
import { FileText, Plus } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createRepaymentSession } from "@/app/actions/request.actions";
import { fetchStudentHistory, HistoryRefreshError } from "@/lib/student-request-fetcher";
import { DEFAULT_HISTORY_QUERY, historyRefreshInterval, mergeCancelledRequest, REQUEST_PAGE_SIZE, STUDENT_HISTORY_URL, studentHistoryURL, toStudentRequest, type HistoryQuery, type RequestSortKey, type StudentHistory } from "@/lib/student-request-model";
import { NewRequestButton } from "./new-request-button";
import { RequestHistoryTable } from "./request-history-table";
import { CancelRequestDialog } from "./cancel-request-dialog";
import { RequestSummary } from "./request-summary";

export function RequestList({ history, isMaintenanceMode = false }: { history: StudentHistory; isMaintenanceMode?: boolean }) {
  const { user, isLoaded } = useUser();
  if (isLoaded && user?.id !== history.studentId) {
    return <p role="alert">Your account changed. Refresh the page to load your request history.</p>;
  }
  return <StudentRequestHistory key={history.studentId} initialHistory={history} isMaintenanceMode={isMaintenanceMode} />;
}

function StudentRequestHistory({ initialHistory, isMaintenanceMode }: { initialHistory: StudentHistory; isMaintenanceMode: boolean }) {
  const { mutate: mutatePages } = useSWRConfig();
  const [query, setQuery] = useState<HistoryQuery>(DEFAULT_HISTORY_QUERY);
  const url = studentHistoryURL(query);
  const initialURL = studentHistoryURL(initialHistory.query);
  const { data, error, isValidating, mutate } = useSWR<StudentHistory, Error>(
    [url, initialHistory.studentId] as const, fetchStudentHistory, {
      fallbackData: url === initialURL ? initialHistory : undefined, keepPreviousData: true,
      // SWR's cache can initially omit fallbackData. Re-evaluate the schedule
      // on render too, so manual/focus recovery can restart a settled interval.
      refreshInterval: current => historyRefreshInterval(current ?? initialHistory), refreshWhenHidden: false, refreshWhenOffline: false,
      revalidateOnFocus: true, revalidateOnReconnect: true, errorRetryCount: 3,
      shouldRetryOnError: error => !(error instanceof HistoryRefreshError && [401, 403].includes(error.status)),
    });
  const history = data ?? initialHistory;
  const items = history.items;
  // The server may clamp a requested page when the history shrinks.
  const matchesQuery = history.query.sort === query.sort && history.query.direction === query.direction && history.query.page === Math.min(query.page, history.totalPages);
  const changingPage = !matchesQuery;
  const sort = { key: history.query.sort, direction: history.query.direction };
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const paymentInFlight = useRef(false);
  const active = useRef(false);
  const previous = useRef(initialHistory.items);
  const cancellation = items.find(item => item.id === cancelTarget);
  useEffect(() => {
    active.current = !error && !changingPage;
    return () => { active.current = false; };
  }, [error, changingPage]);

  useEffect(() => {
    const old = new Map(previous.current.map(item => [item.id, item]));
    previous.current = items.map(item => {
      const before = old.get(item.id);
      if (before && Date.parse(before.updatedAt) > Date.parse(item.updatedAt)) return before;
      if (before && before.status !== item.status) {
        if (item.status === "READY_FOR_PICKUP") toast.success("Update! Your " + item.documentType + " is now Ready for Pickup!");
        else if (item.status === "COMPLETED") toast.success("Success! Your request for " + item.documentType + " is completed.");
        else if (item.status === "PROCESSING") toast.info("Your " + item.documentType + " is now being processed.");
      }
      return item;
    });
  }, [items]);

  function changeSort(key: RequestSortKey) {
    if (paymentInFlight.current || cancellation) return;
    setQuery(current => ({ page: 1, sort: key, direction: current.sort === key && current.direction === "asc" ? "desc" : "asc" }));
    setExpandedId(null);
  }
  function changePage(page: number) {
    if (paymentInFlight.current || cancellation) return;
    setQuery(current => ({ ...current, page })); setExpandedId(null);
  }
  async function refresh() { try { await mutate(); } catch { /* SWR retains the last verified data and exposes its error. */ } }
  async function recordCancellation(saved: Request) {
    // Cache/refresh failures cannot turn a committed cancellation into a failed action.
    try {
      const label = items.find(item => item.id === saved.id)?.documentType;
      const item = toStudentRequest({ ...saved, createdAt: new Date(saved.createdAt), updatedAt: new Date(saved.updatedAt) }, label);
      // Other cached pages/sorts may contain this same row. Patch them too;
      // SWR revalidates active subscriptions and invalidates deduped reads.
      await mutatePages<StudentHistory>(key => Array.isArray(key) && key[1] === initialHistory.studentId &&
        typeof key[0] === "string" && key[0].startsWith(STUDENT_HISTORY_URL),
      current => current ? mergeCancelledRequest(current, item) : current, { revalidate: true });
    } catch { toast.warning("Cancellation was saved. Refresh the history before taking another action."); }
  }
  async function pay(id: string) {
    if (paymentInFlight.current || cancellation || error || changingPage || isValidating) return;
    paymentInFlight.current = true; setPayingId(id);
    try {
      const result = await createRepaymentSession(id);
      if (!active.current) return;
      if (!result.success || !result.redirectUrl) { toast.error(result.error || "Payment setup was not confirmed."); return; }
      const url = new URL(result.redirectUrl);
      if (url.protocol !== "https:") throw new Error("Invalid payment destination");
      window.location.assign(url.href);
    } catch { if (active.current) toast.error("Payment setup could not be confirmed. Wait 30 seconds, then refresh before trying again."); }
    finally { paymentInFlight.current = false; setPayingId(null); }
  }

  if (error instanceof HistoryRefreshError && [401, 403].includes(error.status)) {
    return <p role="alert">Your session changed. Refresh the page to load your request history.</p>;
  }
  return <div className="space-y-8">
    <RequestSummary summary={history.summary} />
    {error && <div role="alert" className="rounded border border-destructive/30 p-4">
      History could not be refreshed. Showing the last verified data; refresh before changing a request.
    </div>}
    <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-2xl">Request History</CardTitle>
          <Button variant="outline" disabled={isValidating} onClick={() => void refresh()}>Refresh history</Button>
        </div>
        <CardDescription>A complete log of your academic document requests.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {changingPage && isValidating && <p role="status" className="p-4">Loading request history...</p>}
        {items.length === 0 ? <div className="flex flex-col items-center gap-4 p-12 text-center">
          <FileText aria-hidden="true" className="h-10 w-10 text-primary" />
          <h3 className="text-xl font-bold">No Requests Found</h3>
          <NewRequestButton isMaintenanceMode={isMaintenanceMode}><Plus aria-hidden="true" className="h-4 w-4" />Create Request</NewRequestButton>
        </div> : <RequestHistoryTable items={items} sort={sort} onSort={changeSort}
          expandedId={expandedId} onExpand={id => setExpandedId(current => current === id ? null : id)}
          payingId={payingId} onPay={id => void pay(id)} actionsDisabled={Boolean(error) || changingPage || isValidating}
          cancellationOpen={Boolean(cancellation)} onCancel={id => { if (!paymentInFlight.current && !changingPage && !error && !isValidating) setCancelTarget(id); }} />}
      </CardContent>
      {items.length > 0 && <CardFooter className="flex flex-wrap items-center justify-between gap-4 border-t py-4">
        <span className="text-sm text-muted-foreground">Showing {(history.query.page - 1) * REQUEST_PAGE_SIZE + 1} to {Math.min(history.query.page * REQUEST_PAGE_SIZE, history.summary.total)} of {history.summary.total} requests</span>
        <nav aria-label="Request history pages" className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => changePage(history.query.page - 1)} disabled={history.query.page === 1 || changingPage || payingId !== null || Boolean(cancellation)}>Previous</Button>
          <span className="text-sm">Page {history.query.page} of {history.totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => changePage(history.query.page + 1)} disabled={history.query.page === history.totalPages || changingPage || payingId !== null || Boolean(cancellation)}>Next</Button>
        </nav>
      </CardFooter>}
    </Card>
    {cancellation && <CancelRequestDialog key={cancellation.id} request={cancellation} canCancel={!error && !changingPage}
      onCommitted={saved => void recordCancellation(saved)} onClose={() => setCancelTarget(current => current === cancellation.id ? null : current)} />}
  </div>;
}
