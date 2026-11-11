"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildFinanceReport, DEFAULT_FINANCE_QUERY, financeCSV, financeQuerySchema, financeURL, formatPHP, manilaDay, REPORT_TIME_ZONE, shiftDay, type FinanceDataset, type FinanceQuery } from "@/lib/finance-model";
import { fetchFinanceData, FinanceRefreshError } from "@/lib/finance-fetcher";
import { FinanceCharts } from "./finance-charts";

export function FinanceClient({ actorId, initialData, initialError }: { actorId: string; initialData?: FinanceDataset; initialError?: string }) {
  const { user, isLoaded } = useUser();
  if (isLoaded && (user?.id !== actorId || user.publicMetadata.role !== "admin")) return <p role="alert">Your administrator account or role changed. Reload the finance dashboard.</p>;
  return <FinanceWorkspace key={actorId} actorId={actorId} initialData={initialData} initialError={initialError} />;
}
function FinanceWorkspace({ actorId, initialData, initialError }: { actorId: string; initialData?: FinanceDataset; initialError?: string }) {
  const [query, setQuery] = useState<FinanceQuery>(DEFAULT_FINANCE_QUERY);
  const [period, setPeriod] = useState<FinanceQuery["period"]>("7days");
  const [from, setFrom] = useState(initialData ? shiftDay(manilaDay(initialData.asOf), -13) : "");
  const [to, setTo] = useState(initialData ? manilaDay(initialData.asOf) : "");
  const [inputError, setInputError] = useState("");
  const [exportSnapshot, setExportSnapshot] = useState<FinanceDataset | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const exporting = useRef(false);
  const active = useRef(false);
  const url = financeURL(query);
  const { data, error, isValidating, mutate } = useSWR<FinanceDataset, Error>([url, actorId] as const, fetchFinanceData, {
    fallbackData: initialData && financeURL(initialData.query) === url ? initialData : undefined,
    keepPreviousData: true, refreshInterval: 0, revalidateOnFocus: true, revalidateOnReconnect: true,
    errorRetryCount: 2, shouldRetryOnError: error => !(error instanceof FinanceRefreshError && [400, 401, 403, 409, 413].includes(error.status)),
  });
  const sessionValid = !(error instanceof FinanceRefreshError && [401, 403].includes(error.status));
  useEffect(() => { active.current = sessionValid; return () => { active.current = false; }; }, [sessionValid]);
  const draft = financeQuerySchema.safeParse({ period, ...(period === "custom" ? { from, to } : {}) });
  const dirty = !draft.success || financeURL(draft.data) !== url;
  const matches = data && financeURL(data.query) === url;
  const snapshot = exportSnapshot ?? data;
  const report = useMemo(() => snapshot ? buildFinanceReport(snapshot) : null, [snapshot]);
  const blocked = !data || !matches || Boolean(error) || isValidating || dirty || Boolean(exportSnapshot);
  async function refresh() { try { await mutate(); } catch { /* Last verified snapshot is retained and the error is displayed. */ } }
  function changePeriod(value: FinanceQuery["period"]) {
    setPeriod(value); setInputError("");
    if (value !== "custom") setQuery({ period: value });
    else {
      const today = data ? manilaDay(data.asOf) : to;
      const start = from || (today ? shiftDay(today, -13) : "");
      const end = to || today;
      setFrom(start); setTo(end);
      const parsed = financeQuerySchema.safeParse({ period: "custom", from: start, to: end });
      if (parsed.success) setQuery(parsed.data);
    }
  }
  function exportCSV() {
    if (blocked || exporting.current || !data || !report?.settled.length) return;
    const link = document.createElement("a");
    const objectURL = URL.createObjectURL(new Blob(["\uFEFF" + financeCSV(data)], { type: "text/csv;charset=utf-8;" }));
    link.href = objectURL; link.download = "neu_settled_values_" + query.period + ".csv";
    document.body.append(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(objectURL), 1000); }
  }
  async function exportPNG() {
    if (blocked || !data || exporting.current || !reportRef.current) return;
    exporting.current = true; setExportSnapshot(data);
    try {
      const { toPng } = await import("html-to-image");
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (!active.current || !reportRef.current) return;
      const png = await toPng(reportRef.current, { pixelRatio: 2, backgroundColor: document.documentElement.classList.contains("dark") ? "#020817" : "#ffffff", skipFonts: true });
      if (!active.current) return;
      const link = document.createElement("a"); link.href = png; link.download = "neu_settled_values_" + data.query.period + ".png"; link.click();
      toast.success("Visual report downloaded.");
    } catch { if (active.current) toast.error("The visual report could not be generated. Try again."); }
    finally { exporting.current = false; setExportSnapshot(null); }
  }
  if (!sessionValid) return <p role="alert">Your administrator session changed. Reload the finance dashboard.</p>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1"><label htmlFor="finance-period" className="block text-sm font-semibold">Submitted-date period</label>
        <select id="finance-period" value={period} disabled={Boolean(exportSnapshot)} className="rounded border bg-background p-2" onChange={event => changePeriod(event.target.value as FinanceQuery["period"])}>
          <option value="7days">Last 7 Days</option><option value="30days">Last 30 Days</option><option value="year">This Year</option><option value="all">All Time</option><option value="custom">Custom Range</option>
        </select>
      </div>
      {period === "custom" && <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
        event.preventDefault(); const parsed = financeQuerySchema.safeParse({ period: "custom", from, to });
        if (!parsed.success || parsed.data.period !== "custom") { setInputError("Select valid start and end dates."); return; }
        setFrom(parsed.data.from!); setTo(parsed.data.to!); setInputError(""); setQuery(parsed.data);
      }}>
        <div><label htmlFor="finance-from" className="block text-sm">From</label><input id="finance-from" type="date" required max={data ? manilaDay(data.asOf) : undefined} value={from} disabled={Boolean(exportSnapshot)} className="rounded border bg-background p-2" onChange={event => setFrom(event.target.value)} /></div>
        <div><label htmlFor="finance-to" className="block text-sm">To (inclusive)</label><input id="finance-to" type="date" required max={data ? manilaDay(data.asOf) : undefined} value={to} disabled={Boolean(exportSnapshot)} className="rounded border bg-background p-2" onChange={event => setTo(event.target.value)} /></div>
        <Button type="submit" disabled={Boolean(exportSnapshot)}>Apply dates</Button>
      </form>}
      <Button variant="outline" disabled={isValidating || Boolean(exportSnapshot)} onClick={() => void refresh()}>Refresh report</Button>
      <Button variant="outline" disabled={blocked || !report?.settled.length} onClick={exportCSV}>Export CSV</Button>
      <Button variant="outline" disabled={blocked} onClick={() => void exportPNG()}>{exportSnapshot ? "Exporting image..." : "Export PNG"}</Button>
    </div>
    {inputError && <p role="alert">{inputError}</p>}
    {dirty && <p role="status">Apply both custom dates before exporting. The report below still shows its labelled period.</p>}
    {(error || (!data && initialError)) && <p role="alert" className="rounded border border-destructive/30 p-4">{error instanceof FinanceRefreshError && error.status === 413 ? error.message : "Finance report could not be refreshed. Previous verified data, if available, is shown; exports are disabled."}</p>}
    {isValidating && <p role="status">Loading finance report...</p>}
    {snapshot && report ? <div ref={reportRef} className="space-y-6 bg-background p-3 rounded-xl">
      <header className="space-y-2"><h2 className="text-xl font-bold">Settled Request Values</h2>
        <p>Submitted dates: {report.range.from ?? "All recorded dates"} to {report.range.to}, {REPORT_TIME_ZONE}.</p>
        <p className="text-sm">Data as of {snapshot.asOf}. {snapshot.items.length} requests in this cohort.</p>
        <p className="text-sm text-muted-foreground">Values use verified collections in PHP centavos for eligible paid or cash-collected requests. Cancelled/refunded requests are excluded. This is a submitted-request report, not a payment-date or net-revenue ledger.</p>
      </header>
      {report.needsReview > 0 && <p className="rounded border border-amber-500 p-3">{report.needsReview} settled request(s) need amount review and are excluded from monetary totals. Legacy units and quotes are not treated as collections.</p>}
      {report.cancelledPaid > 0 && <p className="rounded border border-amber-500 p-3">{report.cancelledPaid} cancelled request(s) are still marked paid. Check payment/refund reconciliation separately.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[
        ["Known Settled Value", formatPHP(report.total)], ["Online Settled Value", formatPHP(report.online)], ["Cash Settled Value", formatPHP(report.cash)], ["Settled Requests", String(report.settled.length)],
      ].map(([label, value]) => <Card key={label}><CardContent className="p-6"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold break-words">{value}</p></CardContent></Card>)}</div>
      <p className="text-sm">{report.knownCount} settled request(s) have a verified collection; {report.excludedCount} unpaid, cancelled, refunded, or otherwise ineligible request(s) are excluded.</p>
      <FinanceCharts report={report} />
    </div> : !isValidating && !error ? <p>No finance snapshot is available. Refresh or select another period.</p> : null}
  </div>;
}
