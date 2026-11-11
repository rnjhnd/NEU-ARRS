"use client";

import { useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { formatPHP } from "@/lib/money-format";
import { DEFAULT_DIRECTORY_SORT, DIRECTORY_URL, directoryView, type DirectoryActor, type DirectorySort, type StudentDirectory } from "@/lib/student-directory-model";
import { DirectoryRefreshError, fetchStudentDirectory } from "@/lib/student-directory-fetcher";
import { DirectoryTable } from "./directory-table";

type Props = DirectoryActor & { initialData?: StudentDirectory; initialError?: string };
export function StudentClient(props: Props) {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <p role="status">Verifying your staff session…</p>;
  if (user?.id !== props.actorId || user.publicMetadata.role !== props.role) return <p role="alert">Your staff account or role changed. Reload the student directory.</p>;
  return <DirectoryWorkspace key={props.actorId + ":" + props.role} {...props} />;
}
function DirectoryWorkspace({ actorId, role, initialData, initialError }: Props) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<DirectorySort>(DEFAULT_DIRECTORY_SORT);
  const [requestedPage, setRequestedPage] = useState(1);
  const matchingInitial = initialData?.actorId === actorId && initialData.role === role ? initialData : undefined;
  const { data, error, isValidating, mutate } = useSWR<StudentDirectory, Error>([DIRECTORY_URL, actorId, role] as const, fetchStudentDirectory, {
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
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{data ? <>Complete directory snapshot: <time dateTime={data.asOf}>{data.asOf}</time>.</> : "A complete directory snapshot is not available."}</p>
      <Button variant="outline" disabled={isValidating} onClick={() => void refresh()}>{isValidating ? "Refreshing directory…" : "Refresh directory"}</Button>
    </div>
    {error && <p role="alert" className="rounded border border-amber-500 p-3">{error instanceof DirectoryRefreshError && error.status === 413 ? error.message : "The student directory could not be refreshed."} {data ? "Showing the last verified complete snapshot." : "No totals are available."} Use Refresh directory to try again.</p>}
    {!data && !error && <p role="status">{isValidating ? "Loading the complete student directory…" : initialError ?? "Student directory unavailable. Refresh to try again."}</p>}
    {data && view && <>
      <p className="text-sm text-muted-foreground">Totals cover all registered students in this snapshot. Verified settled values use original PHP-centavo collections and exclude cancelled/refunded requests; they are not net revenue.</p>
      {data.totals.unverified > 0 && <p role="status" className="rounded border border-amber-500 p-3">{data.totals.unverified} settled payment(s) need amount verification and are excluded from monetary totals.</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <DirectoryMetric label="Registered Students" value={data.totals.students.toLocaleString("en-PH")} />
        <DirectoryMetric label="Total Requests" value={data.totals.requests.toLocaleString("en-PH")} />
        <DirectoryMetric label="Verified Settled Value" value={formatPHP(data.totals.collectedCentavos)} />
      </div>
      <section aria-labelledby="directory-heading" className="overflow-hidden rounded-3xl border bg-card">
        <div className="space-y-4 border-b p-4 sm:p-6">
          <div><h2 id="directory-heading" className="text-xl font-bold">Registered students</h2><p className="text-sm text-muted-foreground">Search names and primary email addresses. Sorting applies to all matching students.</p></div>
          <div className="max-w-md"><label htmlFor="directory-search" className="mb-1 block text-sm font-medium">Search students</label>
            <Input id="directory-search" placeholder="Name or primary email" value={search} maxLength={320} onChange={event => { setSearch(event.target.value); setRequestedPage(1); }} />
          </div>
        </div>
        <DirectoryTable items={view.items} sort={sort} onSort={changeSort} hasStudents={data.items.length > 0} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 sm:p-6">
          <p role="status" aria-live="polite" className="text-sm">Showing {view.start}–{view.end} of {view.matched} matching students. Page {view.page} of {view.totalPages}.</p>
          <nav aria-label="Student directory pages" className="flex gap-2">
            <Button variant="outline" disabled={view.page <= 1} onClick={() => setRequestedPage(view.page - 1)}>Previous</Button>
            <Button variant="outline" disabled={view.page >= view.totalPages} onClick={() => setRequestedPage(view.page + 1)}>Next</Button>
          </nav>
        </div>
      </section>
    </>}
  </div>;
}
function DirectoryMetric({ label, value }: { label: string; value: string }) {
  return <Card className="rounded-3xl"><CardContent className="space-y-2 p-6"><p className="text-sm font-semibold text-muted-foreground">{label}</p><p className="break-words text-3xl font-bold">{value}</p></CardContent></Card>;
}
