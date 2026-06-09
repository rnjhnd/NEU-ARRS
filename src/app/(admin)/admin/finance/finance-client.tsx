"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { format, startOfWeek, endOfWeek, isWithinInterval, isSameMonth } from "date-fns";
import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { DollarSign, CreditCard, Landmark, TrendingUp } from "lucide-react";
import { Request } from "@prisma/client";

export function FinanceClient({ data }: { data: Request[] }) {
  const [timeframe, setTimeframe] = useState<"ALL" | "MONTH" | "WEEK">("ALL");

  const filteredData = useMemo(() => {
    const now = new Date();
    if (timeframe === "WEEK") {
      const start = startOfWeek(now);
      const end = endOfWeek(now);
      return data.filter(r => isWithinInterval(new Date(r.createdAt), { start, end }));
    }
    if (timeframe === "MONTH") {
      return data.filter(r => isSameMonth(new Date(r.createdAt), now));
    }
    return data;
  }, [data, timeframe]);

  const totalRevenue = filteredData.reduce((acc, curr) => acc + (curr.amountPaid || 0), 0);
  const totalInPesos = totalRevenue / 100;

  const onlineRevenue = filteredData.filter(r => r.paymentMethod === "online").reduce((acc, curr) => acc + (curr.amountPaid || 0), 0) / 100;
  const cashRevenue = filteredData.filter(r => r.paymentMethod === "cash").reduce((acc, curr) => acc + (curr.amountPaid || 0), 0) / 100;

  // Chart data formatting
  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.forEach(r => {
      const dateStr = format(new Date(r.createdAt), "MMM dd");
      map.set(dateStr, (map.get(dateStr) || 0) + ((r.amountPaid || 0) / 100));
    });
    return Array.from(map.entries()).map(([date, amount]) => ({ date, amount }));
  }, [filteredData]);

  const pieData = [
    { name: "Online Payment", value: onlineRevenue, color: "var(--color-primary)" },
    { name: "Cash Payment", value: cashRevenue, color: "#10b981" }
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Financial Analytics</h2>
          <p className="text-muted-foreground">Monitor document request revenue.</p>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg">
          {["ALL", "MONTH", "WEEK"].map(t => (
            <button
              key={t}
              onClick={() => setTimeframe(t as "ALL" | "MONTH" | "WEEK")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                timeframe === t 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "ALL" ? "All Time" : `This ${t.charAt(0) + t.slice(1).toLowerCase()}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-sm border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-muted-foreground">Total Revenue</h3>
              <div className="p-2 bg-primary/10 text-primary rounded-lg"><DollarSign className="w-5 h-5" /></div>
            </div>
            <p className="text-4xl font-bold">₱{totalInPesos.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-muted-foreground">Online Payments</h3>
              <div className="p-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg"><CreditCard className="w-5 h-5" /></div>
            </div>
            <p className="text-3xl font-bold">₱{onlineRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-muted-foreground">Cash Payments</h3>
              <div className="p-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg"><Landmark className="w-5 h-5" /></div>
            </div>
            <p className="text-3xl font-bold">₱{cashRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="shadow-sm border-border lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Daily revenue generated from document requests.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {chartData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                <TrendingUp className="w-8 h-8 mb-2 opacity-20" />
                <p>No revenue data for this period.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₱${v}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "8px" }}
                    itemStyle={{ color: "var(--color-foreground)" }}
                    formatter={(val) => [`₱${val}`, "Revenue"]}
                  />
                  <Area type="monotone" dataKey="amount" stroke="var(--color-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border">
          <CardHeader>
            <CardTitle>Payment Method</CardTitle>
            <CardDescription>Distribution of revenue.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center">
            {totalInPesos === 0 ? (
              <p className="text-muted-foreground">No data.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(val) => [`₱${Number(val).toLocaleString()}`, "Amount"]}
                    contentStyle={{ backgroundColor: "var(--color-card)", borderRadius: "8px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
