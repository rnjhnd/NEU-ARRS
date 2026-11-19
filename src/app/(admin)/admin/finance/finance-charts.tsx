"use client";

import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPHP, type FinancePoint, type FinanceReport } from "@/lib/finance-model";

function ValueTooltip({ active, payload, label }: { active?: boolean; payload?: readonly { value?: unknown; name?: unknown }[]; label?: unknown }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-border/50 bg-background/95 backdrop-blur-xl p-3 shadow-lg"><p className="mb-1 text-xs font-semibold text-muted-foreground">{typeof label === "string" ? label : "Settled value"}</p>{payload.map((entry, i) => typeof entry.value === "number" && <p className="font-semibold text-primary" key={i}>{formatPHP(entry.value)}</p>)}</div>;
}
function ChartData({ points }: { points: FinancePoint[] }) {
  return <details className="mt-4 border-t border-border/40 pt-3 text-sm"><summary className="cursor-pointer text-muted-foreground hover:text-primary transition-colors">View chart data</summary><div className="max-h-64 overflow-auto pt-3"><table className="w-full text-left text-xs"><caption className="sr-only">Values in PHP</caption><thead><tr className="border-b border-border/50"><th className="py-2" scope="col">Group</th><th className="text-right" scope="col">Settled value</th></tr></thead><tbody>{points.map(point => <tr className="border-b border-border/30 last:border-0" key={point.key}><th scope="row" className="py-2 font-normal">{point.name}</th><td className="text-right font-medium">{formatPHP(point.centavos)}</td></tr>)}</tbody></table></div></details>;
}
export function FinanceCharts({ report }: { report: FinanceReport }) {
  const methods = report.methods.filter(point => point.centavos > 0);
  return <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <Card className="lg:col-span-2 min-w-0 rounded-3xl border-border bg-card shadow-sm pt-0"><CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent px-6 !py-6"><CardTitle className="text-lg font-bold tracking-tight">Settled Value Trend</CardTitle><CardDescription>Grouped by submitted {report.scale}; labels include the year.</CardDescription></CardHeader><CardContent className="px-6 pb-4">
      <div className="h-72 w-full min-w-0" role="img" aria-label="Settled request value trend. Values are also available in the chart data table.">
        {report.total > 0 ? <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 288 }}><AreaChart data={report.trend} margin={{ top: 15, right: 10, left: 0, bottom: 15 }}>
          <defs><linearGradient id="settled-value-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} /><stop offset="95%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" /><XAxis dataKey="name" minTickGap={30} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} /><YAxis width={90} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={value => formatPHP(Number(value))} />
          <Tooltip content={<ValueTooltip />} /><Area type="linear" dataKey="centavos" name="Settled value" stroke="var(--primary)" strokeWidth={3} fill="url(#settled-value-fill)" dot={report.trend.length <= 31} isAnimationActive={false} />
        </AreaChart></ResponsiveContainer> : <p className="pt-16 text-center text-muted-foreground">No known settled value for this period.</p>}
      </div><ChartData points={report.trend} />
    </CardContent></Card>
    <Card className="min-w-0 rounded-3xl border-border bg-card shadow-sm pt-0"><CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent px-6 !py-6"><CardTitle className="text-lg font-bold tracking-tight">Payment Methods</CardTitle><CardDescription>Known settled request value by method.</CardDescription></CardHeader><CardContent className="px-6 pb-4">
      <div className="h-72 w-full min-w-0" role="img" aria-label="Settled value by payment method. Values are also available in the chart data table.">
        {methods.length ? <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 288 }}><PieChart><Pie data={methods} dataKey="centavos" nameKey="name" innerRadius="45%" outerRadius="70%" isAnimationActive={false}>
          {methods.map(point => <Cell key={point.key} fill={point.key === "online" ? "#0A5C36" : "#eab308"} />)}
        </Pie><Tooltip content={<ValueTooltip />} /><Legend /></PieChart></ResponsiveContainer> : <p className="pt-16 text-center text-muted-foreground">No known payment value for this period.</p>}
      </div><ChartData points={report.methods} />
    </CardContent></Card>
    <Card className="lg:col-span-3 min-w-0 rounded-3xl border-border bg-card shadow-sm pt-0"><CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent px-6 !py-6"><CardTitle className="text-lg font-bold tracking-tight">Settled Value by Document</CardTitle><CardDescription>Up to twelve document labels; remaining labels are combined as Other documents.</CardDescription></CardHeader><CardContent className="px-6 pb-4">
      {report.total > 0 ? <div role="list" aria-label="Settled value by document" className="space-y-4">{report.documents.map(point => <div key={point.key} role="listitem" className="space-y-2">
        <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="min-w-0 break-words">{point.name}</span><span className="font-mono whitespace-nowrap">{formatPHP(point.centavos)}</span></div>
        <div className="h-5 rounded bg-muted overflow-hidden" aria-hidden="true"><div className="h-full rounded bg-primary" style={{ width: (point.centavos / Math.max(1, ...report.documents.map(item => item.centavos))) * 100 + "%" }} /></div>
      </div>)}</div> : <p className="py-10 text-center text-muted-foreground">No known document value for this period.</p>}
      <ChartData points={report.documents} />
    </CardContent></Card>
  </div>;
}
