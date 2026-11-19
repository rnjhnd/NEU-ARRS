"use client";

import { useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Banknote, FileText, RefreshCw, Search, Users } from "lucide-react";
import { WorkspaceMetric, workspaceStyles } from "@/components/workspace-ui";
import { formatPHP } from "@/lib/money-format";
import { DEFAULT_DIRECTORY_SORT, DIRECTORY_URL, directoryView, type DirectoryActor, type DirectorySort, type StudentDirectory } from "@/lib/student-directory-model";
import { DirectoryRefreshError, fetchStudentDirectory } from "@/lib/student-directory-fetcher";
import { DirectoryTable } from "./directory-table";
import { usePageSnapshot, useVerifiedActor } from "@/components/verified-access";

type Props = DirectoryActor & { initialData?: StudentDirectory; initialError?: string };
export function StudentClient(props: Props) {
  const { user, isLoaded } = useUser();
  const actor = useVerifiedActor();
  if (!isLoaded && (actor?.userId !== props.actorId || actor.role !== props.role)) return <p role="status">Verifying your staff session…</p>;
  if (isLoaded && (user?.id !== props.actorId || user.publicMetadata.role !== props.role)) return <p role="alert">Your staff account or role changed. Reload the student directory.</p>;
  return <DirectoryWorkspace key={props.actorId + ":" + props.role} {...props} />;
}
function DirectoryWorkspace({ actorId, role, initialData, initialError }: Props) {
  const snapshotId = usePageSnapshot();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<DirectorySort>(DEFAULT_DIRECTORY_SORT);
  const [requestedPage, setRequestedPage] = useState(1);
  const matchingInitial = initialData?.actorId === actorId && initialData.role === role ? initialData : undefined;
  const { data, error, isValidating, mutate } = useSWR<StudentDirectory, Error>([DIRECTORY_URL, actorId, role, snapshotId] as const, fetchStudentDirectory, {
    fallbackData: matchingInitial, revalidateOnMount: !matchingInitial, refreshInterval: 0,
    revalidateOnFocus: true, revalidateOnReconnect: true, focusThrottleInterval: 60_000, dedupingInterval: 60_000,
    shouldRetryOnError: false,
  });
  const view = useMemo(() => data ? directoryView(data.items, search, sort, requestedPage) : null, [data, search, sort, requestedPage]);
  async function refresh() { try { await mutate(); } catch { /* Keep the last verified snapshot and expose recovery. */ } }
  function changeSort(key: DirectorySort["key"]) {
    setSort(current => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
    setRequestedPage(1);
  }
  // Clerk can hide protected API routes behind a 404 when signed out. This
  // fixed directory URL has no business-level not-found response.
  if (error instanceof DirectoryRefreshError && error.status === 404) return <p role="alert">Staff access to this directory could not be verified. Reload the student directory.</p>;
  if (error instanceof DirectoryRefreshError && [401, 403].includes(error.status)) return <p role="alert">Your staff session changed. Reload the student directory.</p>;
  return <div className="space-y-8 w-full">
    {error && <p role="alert" className={workspaceStyles.warning}>{error instanceof DirectoryRefreshError && error.status === 413 ? error.message : "The student directory could not be refreshed."} {data ? "Showing the last verified complete snapshot." : "No totals are available."} Use Refresh directory to try again.</p>}
    {!data && !error && <p role="status">{isValidating ? "Loading the complete student directory…" : initialError ?? "Student directory unavailable. Refresh to try again."}</p>}
    {data && view && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <WorkspaceMetric label="Registered Students" value={data.totals.students.toLocaleString("en-PH")} icon={Users} tone="slate" />
        <WorkspaceMetric label="Total Requests" value={data.totals.requests.toLocaleString("en-PH")} icon={FileText} tone="gold" />
        <WorkspaceMetric label="Verified Settled Value" value={formatPHP(data.totals.collectedCentavos)} icon={Banknote} emphasize />
      </div>
      {data.totals.unverified > 0 && <p role="status" className={workspaceStyles.warning}>{data.totals.unverified} settled payment(s) need amount verification and are excluded from monetary totals.</p>}
      <section aria-labelledby="directory-heading" className={workspaceStyles.card + " border"}>
        <div className={workspaceStyles.header}>
          <div className="min-w-0"><h2 id="directory-heading" className="text-xl font-bold tracking-tight">Registered students</h2><p className="mt-1 text-sm text-muted-foreground">Search names and primary email addresses. Sorting applies to all matching students.</p></div>
          <div className="relative w-full sm:w-80 shrink-0 group"><label htmlFor="directory-search" className="sr-only">Search students</label>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary" />
            <Input id="directory-search" className={workspaceStyles.search} placeholder="Name or primary email" value={search} maxLength={320} onChange={event => { setSearch(event.target.value); setRequestedPage(1); }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-6 sm:px-8 py-3">
          <p className="text-xs text-muted-foreground">Complete directory snapshot: <time dateTime={data.asOf}>{data.asOf}</time>.</p>
          <Button variant="outline" size="sm" className="rounded-full" disabled={isValidating} onClick={() => void refresh()}><RefreshCw aria-hidden="true" className={"size-3.5 " + (isValidating ? "animate-spin" : "")} />{isValidating ? "Refreshing directory…" : "Refresh directory"}</Button>
        </div>
        <DirectoryTable items={view.items} sort={sort} onSort={changeSort} hasStudents={data.items.length > 0} />
        <div className={workspaceStyles.footer}>
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground text-center sm:text-left">Showing {view.start}–{view.end} of {view.matched} matching students. Page {view.page} of {view.totalPages}.</p>
          <nav aria-label="Student directory pages" className="flex gap-2 shrink-0">
            <Button variant="outline" className="rounded-full min-w-24" disabled={view.page <= 1} onClick={() => setRequestedPage(view.page - 1)}>Previous</Button>
            <Button variant="outline" className="rounded-full min-w-24" disabled={view.page >= view.totalPages} onClick={() => setRequestedPage(view.page + 1)}>Next</Button>
          </nav>
        </div>
      </section>
      <p className="text-xs leading-relaxed text-muted-foreground">Totals cover all registered students in this snapshot. Verified settled values use original PHP-centavo collections and exclude cancelled/refunded requests; they are not net revenue.</p>
    </>}
    {!data && <Button variant="outline" className={workspaceStyles.button} disabled={isValidating} onClick={() => void refresh()}><RefreshCw aria-hidden="true" className={"mr-2 size-4 " + (isValidating ? "animate-spin" : "")} />{isValidating ? "Refreshing directory…" : "Refresh directory"}</Button>}
  </div>;
}
