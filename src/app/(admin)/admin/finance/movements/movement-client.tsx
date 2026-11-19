"use client";
import { Banknote, RotateCcw, Wallet } from "lucide-react";
import { WorkspaceMetric, workspaceStyles } from "@/components/workspace-ui";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import useSWR from "swr";
import { usePageSnapshot } from "@/components/verified-access";
import { Button } from "@/components/ui/button";
import { formatPHP } from "@/lib/money-format";
import { manilaDay } from "@/lib/finance-model";
import { DEFAULT_MOVEMENT_QUERY, movementQuerySchema, movementURL, movementTotals, movementCSV, type MovementDataset, type MoneyMovement, type MovementQuery } from "@/lib/money-movement-model";
import { fetchMoneyMovements, MovementRefreshError } from "@/lib/money-movement-fetcher";
import { DateReviewDialog } from "./date-review-dialog";

export function MovementClient({ actorId, initialData }: { actorId: string; initialData?: MovementDataset }) {
  const { user, isLoaded } = useUser();
  if (isLoaded && (user?.id !== actorId || user.publicMetadata.role !== "admin")) return <p role="alert">Your administrator account or role changed. Reload the report.</p>;
  return <MovementWorkspace key={actorId} actorId={actorId} initialData={initialData} />;
}
const displayTime = (value: string) => new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
const keyOf = (item: MoneyMovement) => item.requestId + ":" + item.kind;
const dateBasisLabels = { PROVIDER_ORIGINAL_EVIDENCE: "Provider/original evidence", REGISTRAR_ATTESTATION: "Registrar attestation", UNKNOWN: "Date not evidenced" };
function MovementWorkspace({ actorId, initialData }: { actorId: string; initialData?: MovementDataset }) {
  const snapshotId = usePageSnapshot();
  const [query, setQuery] = useState<MovementQuery>(DEFAULT_MOVEMENT_QUERY);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [datedPage, setDatedPage] = useState(1);
  const [dialog, setDialog] = useState<MoneyMovement | null>(null);
  const [reviewPending, setReviewPending] = useState(false);
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const [inputError, setInputError] = useState("");
  const active = useRef(false);
  const url = movementURL(query);
  const matchingInitial = initialData && movementURL(initialData.query) === url ? initialData : undefined;
  const { data, error, isValidating, mutate } = useSWR<MovementDataset, Error>([url, actorId, snapshotId] as const, fetchMoneyMovements, {
    fallbackData: matchingInitial, revalidateOnMount: !matchingInitial,
    keepPreviousData: true, refreshInterval: 0, revalidateOnFocus: true, revalidateOnReconnect: true, errorRetryCount: 2,
    shouldRetryOnError: error => !(error instanceof MovementRefreshError && [400, 401, 403, 404, 409, 413].includes(error.status)),
    onSuccess: () => setRequiresRefresh(false),
  });
  const sessionValid = !(error instanceof MovementRefreshError && [401, 403, 404].includes(error.status));
  useEffect(() => { active.current = sessionValid; return () => { active.current = false; }; }, [sessionValid]);
  const matches = data && movementURL({ ...query, undatedPage: Math.min(query.undatedPage, data.undatedPages) }) === movementURL(data.query);
  const dirty = query.period === "custom" && (from !== query.from || to !== query.to);
  const blocked = !data || !matches || Boolean(error) || isValidating || requiresRefresh || dirty;
  const busy = blocked || reviewPending || Boolean(dialog);
  const totals = movementTotals(data?.dated ?? []);
  const pages = Math.max(1, Math.ceil((data?.dated.length ?? 0) / 10)), page = Math.min(datedPage, pages);
  async function refresh() { try { await mutate(); } catch { /* Keep the last verified snapshot read-only. */ } }
  function download(items: MoneyMovement[], scope: "Dated selected period" | "Undated current page only") {
    if (busy || !data || !items.length || !active.current) return;
    const url = URL.createObjectURL(new Blob(["\uFEFF" + movementCSV(items, data.asOf, scope)], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = scope.startsWith("Dated") ? "neu_dated_money_movements.csv" : "neu_undated_movements_page.csv";
    document.body.append(anchor); try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  if (!sessionValid) return <p role="alert">Your administrator session changed. Reload the report.</p>;
  return <div className="space-y-8 w-full">
    <p>Collections and confirmed refunds by evidenced transaction date, using Manila (UTC+08:00). Net recorded movements exclude provider fees and do not represent profit or bank payouts.</p>
    <p className="text-sm">Request cancellation does not erase a collection. Pending or uncertain refunds are not subtracted as confirmed refunds. Undated amounts are listed separately across all dates.</p>
    <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm"><div className="space-y-1"><label htmlFor="movement-period" className="block">Transaction-date period</label><select id="movement-period" value={query.period} disabled={reviewPending || Boolean(dialog)} className={workspaceStyles.select} onChange={event => {
      const period = event.target.value as MovementQuery["period"]; setInputError(""); setDatedPage(1);
      if (period === "custom") { const day = data ? manilaDay(data.asOf) : manilaDay(new Date().toISOString()); setFrom(day); setTo(day); setQuery({ period, from: day, to: day, undatedPage: 1 }); }
      else setQuery({ period, undatedPage: 1 });
    }}><option value="7days">Last 7 Days</option><option value="30days">Last 30 Days</option><option value="year">This Year</option><option value="all">All Time</option><option value="custom">Custom Range</option></select></div>
      {query.period === "custom" && <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault();
        const parsed = movementQuerySchema.safeParse({ period: "custom", from, to, undatedPage: 1 });
        if (!parsed.success || parsed.data.period !== "custom") { setInputError("Select valid start and end dates."); return; }
        setFrom(parsed.data.from); setTo(parsed.data.to); setQuery(parsed.data); setDatedPage(1); setInputError("");
      }}><label>From<input aria-label="Transaction start date" type="date" required value={from} disabled={reviewPending || Boolean(dialog)} onChange={event => setFrom(event.target.value)} className={workspaceStyles.field + " block h-10"} /></label><label>To (inclusive)<input aria-label="Transaction end date" type="date" required value={to} disabled={reviewPending || Boolean(dialog)} onChange={event => setTo(event.target.value)} className={workspaceStyles.field + " block h-10"} /></label><Button type="submit" disabled={reviewPending || Boolean(dialog)}>Apply dates</Button></form>}
      <Button variant="outline" disabled={isValidating || reviewPending} onClick={() => void refresh()}>Refresh movements</Button>
    </div>
    {inputError && <p role="alert">{inputError}</p>}
    {(error || requiresRefresh || !data) && <p role="alert">Report refresh required. Previous verified data remains read-only.{error instanceof MovementRefreshError && error.status === 413 ? " Choose a shorter transaction-date period." : ""}</p>}
    {data && !matches && <p role="status">Loading the selected period. Previous rows remain read-only.</p>}
    {data && <>
      <p className="text-xs">Snapshot: {displayTime(data.asOf)} Manila</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"><WorkspaceMetric label="Gross collections" value={formatPHP(Number(totals.collections))} icon={Banknote} /><WorkspaceMetric label="Confirmed refunds" value={formatPHP(Number(totals.refunds))} icon={RotateCcw} tone="gold" /><WorkspaceMetric label="Net recorded movements" value={formatPHP(Number(totals.net))} icon={Wallet} tone="slate" /></div>
      <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm" aria-label="Dated money movements"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Dated movements in selected period</h2><Button variant="outline" disabled={busy || !data.dated.length} onClick={() => download(data.dated, "Dated selected period")}>Export dated movements CSV</Button></div>
        <MovementTable items={data.dated.slice((page - 1) * 10, page * 10)} />
        <nav aria-label="Dated movement pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4 text-sm text-muted-foreground"><Button variant="outline" disabled={busy || page === 1} onClick={() => setDatedPage(page - 1)}>Previous dated page</Button><span>{page} / {pages} · {data.dated.length} dated movement(s)</span><Button variant="outline" disabled={busy || page === pages} onClick={() => setDatedPage(page + 1)}>Next dated page</Button></nav>
      </section>
      <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm" aria-label="Undated money movements"><h2 className="text-xl font-bold">Undated movements — all dates</h2>
        <p className="text-sm">Excluded from selected-period totals: {data.undatedSummary.collections} collection(s), {formatPHP(data.undatedSummary.collectionCentavos)}; {data.undatedSummary.refunds} confirmed refund(s), {formatPHP(data.undatedSummary.refundCentavos)}. Their actual dates are unknown.</p>
        {data.missingCollectionEvidence > 0 && <p role="status">{data.missingCollectionEvidence} request(s) across all dates lack verified collection evidence. Their amounts are not included. Reconcile original evidence separately.</p>}
        <Button variant="outline" disabled={busy || !data.undated.length} onClick={() => download(data.undated, "Undated current page only")}>Export undated current page CSV</Button>
        <MovementTable items={data.undated} disabled={busy} onReview={setDialog} />
        <nav aria-label="Undated movement pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4 text-sm text-muted-foreground"><Button variant="outline" disabled={busy || data.query.undatedPage === 1} onClick={() => setQuery({ ...query, undatedPage: data.query.undatedPage - 1 })}>Previous undated page</Button><span>Undated page {data.query.undatedPage} / {data.undatedPages}</span><Button variant="outline" disabled={busy || data.query.undatedPage === data.undatedPages} onClick={() => setQuery({ ...query, undatedPage: data.query.undatedPage + 1 })}>Next undated page</Button></nav>
      </section>
    </>}
    {dialog && <DateReviewDialog key={keyOf(dialog)} movement={dialog} disabled={blocked || !data?.undated.some(item => keyOf(item) === keyOf(dialog) && item.version === dialog.version)} onPending={setReviewPending} onClose={() => { if (!reviewPending) setDialog(null); }} onSaved={() => {
      if (!active.current) return; setDialog(null); setRequiresRefresh(true); void refresh();
    }} />}
  </div>;
}
function MovementTable({ items, disabled, onReview }: { items: MoneyMovement[]; disabled?: boolean; onReview?: (item: MoneyMovement) => void }) {
  return <div className="max-w-full overflow-x-auto rounded-2xl border border-border/50"><table className="w-full min-w-[760px] text-sm"><thead><tr>{["Request", "Document", "Movement / method", "Amount", "Occurred (Manila)", "Date basis", ...(onReview ? ["Review"] : [])].map(label => <th scope="col" className="bg-muted/20 px-4 py-4 text-left text-xs font-semibold text-muted-foreground" key={label}>{label}</th>)}</tr></thead><tbody>
    {items.length ? items.map(item => <tr key={keyOf(item)} className="border-t border-border/40 hover:bg-primary/5 transition-colors"><td className="max-w-56 break-all p-3">{item.requestId}</td><td className="p-3">{item.documentLabel}</td><td className="p-3">{item.kind === "COLLECTION" ? "Collection" : "Refund"} / {item.method}</td><td className="p-3 whitespace-nowrap">{formatPHP(item.amountCentavos)}</td><td className="p-3">{item.occurredAt ? displayTime(item.occurredAt) : "Unknown — unallocated"}</td><td className="p-3">{dateBasisLabels[item.dateBasis]}<p className="text-xs">Movement recorded: {displayTime(item.recordedAt)}</p></td>{onReview && <td className="p-3"><Button variant="outline" size="sm" disabled={disabled} aria-label={"Record date " + keyOf(item)} onClick={() => onReview(item)}>Record evidenced date</Button></td>}</tr>) : <tr><td colSpan={onReview ? 7 : 6} className="p-6 text-center">No movements in this view.</td></tr>}
  </tbody></table></div>;
}
