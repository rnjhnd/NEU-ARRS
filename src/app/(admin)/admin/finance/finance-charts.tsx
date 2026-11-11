"use client";

import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPHP, type FinancePoint, type FinanceReport } from "@/lib/finance-model";

function ValueTooltip({ active, payload, label }: { active?: boolean; payload?: readonly { value?: unknown; name?: unknown }[]; label?: unknown }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded border bg-background p-3 shadow"><p>{typeof label === "string" ? label : "Settled value"}</p>{payload.map((entry, i) => typeof entry.value === "number" && <p key={i}>{formatPHP(entry.value)}</p>)}</div>;
}
function ChartData({ points }: { points: FinancePoint[] }) {
  return <details className="mt-3 text-sm"><summary className="cursor-pointer">View chart data</summary><div className="max-h-64 overflow-auto"><table className="w-full text-left"><caption className="sr-only">Values in PHP</caption><thead><tr><th scope="col">Group</th><th scope="col">Settled value</th></tr></thead><tbody>{points.map(point => <tr key={point.key}><th scope="row" className="font-normal">{point.name}</th><td>{formatPHP(point.centavos)}</td></tr>)}</tbody></table></div></details>;
}
export function FinanceCharts({ report }: { report: FinanceReport }) {
  const methods = report.methods.filter(point => point.centavos > 0);
  return <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <Card className="lg:col-span-2 min-w-0"><CardHeader><CardTitle>Settled Value Trend</CardTitle><CardDescription>Grouped by submitted {report.scale}; labels include the year.</CardDescription></CardHeader><CardContent>
      <div className="h-72 w-full min-w-0" role="img" aria-label="Settled request value trend. Values are also available in the chart data table.">
        {report.total > 0 ? <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 288 }}><LineChart data={report.trend} margin={{ top: 15, right: 20, left: 15, bottom: 15 }}>
          <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" minTickGap={30} /><YAxis width={90} tickFormatter={value => formatPHP(Number(value))} />
          <Tooltip content={<ValueTooltip />} /><Line type="linear" dataKey="centavos" name="Settled value" stroke="#0A5C36" strokeWidth={3} dot={report.trend.length <= 31} isAnimationActive={false} />
        </LineChart></ResponsiveContainer> : <p className="pt-16 text-center text-muted-foreground">No known settled value for this period.</p>}
      </div><ChartData points={report.trend} />
    </CardContent></Card>
    <Card className="min-w-0"><CardHeader><CardTitle>Payment Methods</CardTitle><CardDescription>Known settled request value by method.</CardDescription></CardHeader><CardContent>
      <div className="h-72 w-full min-w-0" role="img" aria-label="Settled value by payment method. Values are also available in the chart data table.">
        {methods.length ? <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 288 }}><PieChart><Pie data={methods} dataKey="centavos" nameKey="name" innerRadius="45%" outerRadius="70%" isAnimationActive={false}>
          {methods.map(point => <Cell key={point.key} fill={point.key === "online" ? "#0A5C36" : "#eab308"} />)}
        </Pie><Tooltip content={<ValueTooltip />} /><Legend /></PieChart></ResponsiveContainer> : <p className="pt-16 text-center text-muted-foreground">No known payment value for this period.</p>}
      </div><ChartData points={report.methods} />
    </CardContent></Card>
    <Card className="lg:col-span-3 min-w-0"><CardHeader><CardTitle>Settled Value by Document</CardTitle><CardDescription>Up to twelve document labels; remaining labels are combined as Other documents.</CardDescription></CardHeader><CardContent>
      {report.total > 0 ? <div role="list" aria-label="Settled value by document" className="space-y-4">{report.documents.map(point => <div key={point.key} role="listitem" className="space-y-2">
        <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="min-w-0 break-words">{point.name}</span><span className="font-mono whitespace-nowrap">{formatPHP(point.centavos)}</span></div>
        <div className="h-5 rounded bg-muted overflow-hidden" aria-hidden="true"><div className="h-full rounded bg-primary" style={{ width: (point.centavos / Math.max(1, ...report.documents.map(item => item.centavos))) * 100 + "%" }} /></div>
      </div>)}</div> : <p className="py-10 text-center text-muted-foreground">No known document value for this period.</p>}
      <ChartData points={report.documents} />
    </CardContent></Card>
  </div>;
}
