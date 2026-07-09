"use client";

import { useState } from "react";
import { toPng } from "html-to-image";
import { motion } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Request } from "@prisma/client";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, LabelList
} from "recharts";
import { format, subDays } from "date-fns";
import { DollarSign, CreditCard, Banknote, TrendingUp, Download, Loader2, Image as ImageIcon, FileSpreadsheet, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COLORS = ['#0A5C36', '#eab308'];

export function FinanceClient({ requests }: { requests: Request[] }) {
  const [isExporting, setIsExporting] = useState(false);
  const [timePeriod, setTimePeriod] = useState<"7days" | "30days" | "year" | "all">("7days");
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background/95 backdrop-blur-md border border-border shadow-lg rounded-xl p-3">
          <p className="font-semibold text-foreground mb-1">{label || "Revenue"}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
              <p className="text-sm text-muted-foreground font-medium">
                <span className="text-foreground font-bold font-mono">₱{Number(entry.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </p>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };
  
  const CustomLegend = (props: any) => {
    const { payload } = props;
    return (
      <div className="flex flex-wrap justify-center items-center gap-6 pt-5">
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }}></div>
            <span className="text-sm font-medium text-muted-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const getAmount = (req: Request) => {
    if (req.amountPaid) return req.amountPaid;
    if (req.paymentMethod === 'cash') return 150;
    return 0;
  };

  const isCompletedOrPaid = (req: Request) => {
    if (req.status === 'CANCELLED') return false;
    if (req.paymentStatus === 'PAID') return true;
    if (req.paymentStatus === 'CASH_ON_PICKUP' && req.status === 'COMPLETED') return true;
    return false;
  };

  // 1. Filter Data based on Time Period
  const now = new Date();
  const filteredRequests = requests.filter(req => {
    const d = new Date(req.createdAt);
    if (timePeriod === "7days") return d >= subDays(now, 7);
    if (timePeriod === "30days") return d >= subDays(now, 30);
    if (timePeriod === "year") return d.getFullYear() === now.getFullYear();
    return true; // all
  });

  // 2. Top Level KPIs
  const totalRevenue = filteredRequests.filter(isCompletedOrPaid).reduce((sum, req) => sum + getAmount(req), 0);
  
  const onlineRequests = filteredRequests.filter(r => r.paymentMethod === 'online' && isCompletedOrPaid(r));
  const onlineRevenue = onlineRequests.reduce((sum, req) => sum + getAmount(req), 0);
  
  const cashRequests = filteredRequests.filter(r => r.paymentMethod === 'cash' && isCompletedOrPaid(r));
  const cashRevenue = cashRequests.reduce((sum, req) => sum + getAmount(req), 0);

  // 3. Revenue Over Time
  let revenueOverTime: any[] = [];
  
  if (timePeriod === "7days" || timePeriod === "30days") {
    const days = timePeriod === "7days" ? 7 : 30;
    const dateArray = Array.from({ length: days }, (_, i) => format(subDays(now, days - 1 - i), 'MMM dd'));
    revenueOverTime = dateArray.map(dateStr => {
      const dailyRev = filteredRequests.filter(isCompletedOrPaid).reduce((sum, req) => {
        if (format(new Date(req.createdAt), 'MMM dd') === dateStr) return sum + getAmount(req);
        return sum;
      }, 0);
      return { name: dateStr, revenue: dailyRev };
    });
  } else {
    // Group by month
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (timePeriod === "year") {
      revenueOverTime = months.map((month, i) => {
        const monthlyRev = filteredRequests.filter(isCompletedOrPaid).reduce((sum, req) => {
          const d = new Date(req.createdAt);
          if (d.getMonth() === i && d.getFullYear() === now.getFullYear()) return sum + getAmount(req);
          return sum;
        }, 0);
        return { name: month, revenue: monthlyRev };
      });
    } else { // all time
      const uniqueYearMonths = Array.from(new Set(filteredRequests.map(r => format(new Date(r.createdAt), "MMM yyyy"))))
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      
      revenueOverTime = uniqueYearMonths.map(ym => {
        const rev = filteredRequests.filter(isCompletedOrPaid).reduce((sum, req) => {
          if (format(new Date(req.createdAt), "MMM yyyy") === ym) return sum + getAmount(req);
          return sum;
        }, 0);
        return { name: ym, revenue: rev };
      });
      
      if (revenueOverTime.length === 0) {
        revenueOverTime = [{ name: format(now, "MMM yyyy"), revenue: 0 }];
      }
    }
  }

  // 4. Payment Method Distribution
  const paymentMethodData = [
    { name: 'Online', value: onlineRevenue },
    { name: 'Cash on Pickup', value: cashRevenue },
  ].filter(d => d.value > 0);

  // 5. Document Type Revenue
  const documentTypes = [...new Set(filteredRequests.map(r => r.documentType))];
  const documentData = documentTypes.map(type => {
    const typeRevenue = filteredRequests
      .filter(r => r.documentType === type && isCompletedOrPaid(r))
      .reduce((sum, req) => sum + getAmount(req), 0);
    return { name: type, revenue: typeRevenue };
  }).sort((a, b) => b.revenue - a.revenue);

  const exportToCSV = () => {
    const paidRequests = filteredRequests.filter(isCompletedOrPaid);
    if (paidRequests.length === 0) return toast.error("There is no revenue data available to export for this period.");
    
    const headers = ["Reference ID", "Document", "Purpose", "Payment Method", "Revenue (PHP)", "Date Paid"];
    const rows = paidRequests.map(r => [
      r.id,
      r.documentType,
      r.purpose,
      r.paymentMethod,
      getAmount(r),
      format(new Date(r.updatedAt || r.createdAt), "yyyy-MM-dd HH:mm:ss")
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `neu_revenue_report_${format(new Date(), "yyyyMMdd")}.csv`);
    link.click();
  };

  const exportToImage = async () => {
    const element = document.getElementById("finance-visual-report");
    if (!element) return toast.error("Report content not found.");
    
    setIsExporting(true);
    toast.info("Generating high-quality snapshot...", { duration: 2000 });
    
    try {
      await new Promise(r => setTimeout(r, 800));
      const isDark = document.documentElement.classList.contains("dark");
      const image = await toPng(element, {
        pixelRatio: 2,
        backgroundColor: isDark ? "#020817" : "#ffffff",
        cacheBust: true,
        skipFonts: true,
      });
      
      const link = document.createElement("a");
      link.href = image;
      link.download = `neu_finance_charts_${format(new Date(), "yyyyMMdd")}.png`;
      link.click();
      toast.success("Visual report downloaded!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate image.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Financial Analytics</h2>
        
        <div className="flex flex-wrap items-center gap-3">
          <Select value={timePeriod} onValueChange={(val: any) => setTimePeriod(val)}>
            <SelectTrigger className="w-[160px] h-10 rounded-full border-border/50 bg-background/40 hover:bg-background/80 transition-all">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <SelectValue placeholder="Select Period" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/50 shadow-xl bg-background/95 backdrop-blur-md">
              <SelectItem value="7days" className="rounded-lg cursor-pointer">Last 7 Days</SelectItem>
              <SelectItem value="30days" className="rounded-lg cursor-pointer">Last 30 Days</SelectItem>
              <SelectItem value="year" className="rounded-lg cursor-pointer">This Year</SelectItem>
              <SelectItem value="all" className="rounded-lg cursor-pointer">All Time</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger className="h-10 px-5 rounded-full border border-primary/20 bg-background text-foreground shadow-sm transition-all hover:bg-muted focus:bg-muted active:scale-95 flex items-center gap-2 font-medium text-sm disabled:pointer-events-none disabled:opacity-50 outline-none" disabled={isExporting}>
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isExporting ? "Exporting..." : "Export"}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl border border-border/50 shadow-xl bg-background/95 backdrop-blur-md p-1">
              <DropdownMenuItem onClick={exportToImage} className="rounded-md cursor-pointer flex items-center p-2 focus:bg-primary/10">
                <ImageIcon className="w-4 h-4 mr-3 opacity-70" />
                Visual Report (.png)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToCSV} className="rounded-md cursor-pointer flex items-center p-2 focus:bg-primary/10">
                <FileSpreadsheet className="w-4 h-4 mr-3 opacity-70" />
                Raw Data (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div id="finance-visual-report" className="space-y-8 pb-4">
        {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Total Revenue</p>
              <h3 className="text-2xl font-bold mt-1 text-foreground">₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
            <div className="p-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl shrink-0">
              <DollarSign className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Online Payments</p>
              <h3 className="text-2xl font-bold mt-1 text-foreground">₱{onlineRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
            <div className="p-4 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl shrink-0">
              <CreditCard className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Cash on Pickup</p>
              <h3 className="text-2xl font-bold mt-1 text-foreground">₱{cashRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
            <div className="p-4 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-2xl shrink-0">
              <Banknote className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Paid Requests</p>
              <h3 className="text-2xl font-bold mt-1 text-foreground">{filteredRequests.filter(isCompletedOrPaid).length}</h3>
            </div>
            <div className="p-4 bg-primary/10 text-primary rounded-2xl shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trends */}
        <Card className="lg:col-span-2 shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-8">
            <CardTitle className="text-xl font-bold tracking-tight text-foreground">Revenue Trend</CardTitle>
            <CardDescription>Visualized revenue based on the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 pt-6 h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueOverTime} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="currentColor" className="opacity-[0.05]" />
                <XAxis dataKey="name" stroke="currentColor" className="opacity-50 text-xs" tickLine={false} axisLine={false} tickMargin={12} />
                <YAxis 
                  stroke="currentColor" 
                  className="opacity-50 text-xs" 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `₱${value}`}
                  tickMargin={12}
                  width={80}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'currentColor', strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.2 }} />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#0A5C36" 
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                >
                  {isExporting && (
                    <LabelList 
                      dataKey="revenue" 
                      position="top" 
                      offset={10}
                      formatter={(value: any) => typeof value === 'number' && value > 0 ? `₱${value.toLocaleString()}` : ''}
                      className="fill-foreground text-xs font-semibold"
                    />
                  )}
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Methods Pie */}
        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-8">
            <CardTitle className="text-xl font-bold tracking-tight text-foreground">Payment Methods</CardTitle>
            <CardDescription>Online vs Cash collection.</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 pt-6 h-[350px] flex items-center justify-center">
            {paymentMethodData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="42%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                    {isExporting && (
                      <LabelList 
                        dataKey="value" 
                        position="inside" 
                        formatter={(value: any) => typeof value === 'number' && value > 0 ? `₱${value.toLocaleString()}` : ''}
                        className="fill-white text-xs font-bold drop-shadow-md"
                      />
                    )}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend content={<CustomLegend />} verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground h-full">
                <p>No payment data for this period.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Document Performance Bar Chart */}
        <Card className="lg:col-span-3 shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-8">
            <CardTitle className="text-xl font-bold tracking-tight text-foreground">Revenue by Document Type</CardTitle>
            <CardDescription>Which documents generate the most value.</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 pt-6 h-[350px]">
            {documentData.length > 0 && documentData.some(d => d.revenue > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={documentData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>

                  <XAxis 
                    type="number" 
                    stroke="currentColor" 
                    className="opacity-50 text-xs" 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(value) => `₱${value}`}
                    tickMargin={12}
                  />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    stroke="currentColor" 
                    className="opacity-50 text-xs font-medium" 
                    tickLine={false} 
                    axisLine={false} 
                    tickMargin={12}
                    width={180}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'currentColor', opacity: 0.05 }} />
                  <Bar dataKey="revenue" fill="#0A5C36" radius={[0, 4, 4, 0]} barSize={32}>
                    {isExporting && (
                      <LabelList 
                        dataKey="revenue" 
                        position="right" 
                        formatter={(value: any) => typeof value === 'number' && value > 0 ? `₱${value.toLocaleString()}` : ''}
                        className="fill-foreground text-xs font-semibold"
                      />
                    )}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground h-full">
                <p>No document revenue data for this period.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}

