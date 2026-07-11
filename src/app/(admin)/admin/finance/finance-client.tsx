"use client";

import { useState } from "react";
import { toPng } from "html-to-image";
import { motion, AnimatePresence } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Request } from "@prisma/client";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, LabelList
} from "recharts";
import { format, subDays } from "date-fns";
import { DollarSign, CreditCard, Banknote, TrendingUp, Download, Loader2, Image as ImageIcon, FileSpreadsheet, Calendar as CalendarIcon, Filter, PieChart as LucidePieChart, BarChart3 as LucideBarChart, LineChart as LucideLineChart } from "lucide-react";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COLORS = ['#0A5C36', '#eab308'];

export function FinanceClient({ requests }: { requests: Request[] }) {
  const [isExporting, setIsExporting] = useState(false);
  const [timePeriod, setTimePeriod] = useState<"7days" | "30days" | "year" | "all" | "custom">("7days");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 14),
    to: new Date(),
  });
  
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
  
  const CustomAnimatedDot = (props: any) => {
    const { cx, cy, index, dataCount } = props;
    
    // The line animates over 1000ms. We stagger the dots so they pop right when the line reaches them!
    const delay = dataCount > 1 ? (index / (dataCount - 1)) * 1.0 : 0;
  
    return (
      <motion.circle
        cx={cx}
        cy={cy}
        r={4}
        stroke="#0A5C36"
        strokeWidth={2}
        fill="var(--background)"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay, type: "spring", stiffness: 300, damping: 20 }}
      />
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
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const filteredRequests = requests.filter(req => {
    const d = new Date(req.createdAt);
    if (timePeriod === "7days") return d >= subDays(todayStart, 6);
    if (timePeriod === "30days") return d >= subDays(todayStart, 29);
    if (timePeriod === "year") return d.getFullYear() === now.getFullYear();
    if (timePeriod === "custom" && dateRange?.from) {
      let from = new Date(dateRange.from);
      if (dateRange.to) {
        let to = new Date(dateRange.to);
        if (from > to) {
          const temp = from;
          from = to;
          to = temp;
        }
        to.setHours(23, 59, 59, 999);
        return d >= from && d <= to;
      }
      return d >= from;
    }
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
  
  const isDaysScale = timePeriod === "7days" || timePeriod === "30days" || 
    (timePeriod === "custom" && dateRange?.from && (!dateRange.to || Math.ceil(Math.abs(dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) <= 31));

  if (isDaysScale) {
    const fromDate = timePeriod === "custom" ? dateRange!.from! : subDays(todayStart, timePeriod === "7days" ? 6 : 29);
    const toDate = timePeriod === "custom" && dateRange?.to ? dateRange.to : now;
    
    // Ensure start is before end
    let start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    let end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
    
    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }
    
    // Prevent massive arrays if someone selects a 10 year range by accident, though UI groups by month > 31
    const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    
    const dateArray = Array.from({ length: Math.min(diffDays, 31) }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return format(d, 'MMM dd');
    });
    
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
    } else { // all time OR custom > 31 days
      const uniqueYearMonths = Array.from(new Set(filteredRequests.map(req => format(new Date(req.createdAt), "MMM yyyy"))))
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      
      revenueOverTime = uniqueYearMonths.map(ym => {
        const rev = filteredRequests.filter(isCompletedOrPaid).reduce((sum, req) => {
          if (format(new Date(req.createdAt), "MMM yyyy") === ym) return sum + getAmount(req);
          return sum;
        }, 0);
        return { name: ym, revenue: rev };
      });
      
      if (revenueOverTime.length === 0) {
        const fallBackDate = timePeriod === "custom" && dateRange?.to ? dateRange.to : now;
        revenueOverTime = [{ name: format(fallBackDate, "MMM yyyy"), revenue: 0 }];
      }

      if (revenueOverTime.length === 1) {
        // If there's only one month of data, pad with the previous month so a trend line can be drawn
        const singleMonth = revenueOverTime[0].name; // e.g. "Jun 2026"
        const [mStr, yStr] = singleMonth.split(" ");
        const mIndex = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(mStr);
        let prevYear = parseInt(yStr);
        let prevMonthIndex = mIndex - 1;
        if (prevMonthIndex < 0) {
          prevMonthIndex = 11;
          prevYear -= 1;
        }
        const prevMonthStr = `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][prevMonthIndex]} ${prevYear}`;
        revenueOverTime = [
          { name: prevMonthStr, revenue: 0 },
          revenueOverTime[0]
        ];
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
      <div className="flex flex-col sm:flex-row justify-end items-start sm:items-center gap-4 w-full">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <Select value={timePeriod} onValueChange={(val: any) => setTimePeriod(val)}>
            <SelectTrigger className="h-10 w-full sm:w-[180px] rounded-full border-border/50 bg-background/40 hover:bg-background/80 focus:bg-background transition-all">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span>
                  {timePeriod === "7days" ? "Last 7 Days" : timePeriod === "30days" ? "Last 30 Days" : timePeriod === "year" ? "This Year" : timePeriod === "custom" ? "Custom Range" : "All Time"}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="end" className="rounded-xl border-border/40 shadow-lg backdrop-blur-xl bg-background/95 min-w-[180px] p-1">
              <SelectItem value="7days" className="rounded-md my-0.5 font-medium cursor-pointer focus:bg-primary/10 transition-colors py-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  Last 7 Days
                </div>
              </SelectItem>
              <SelectItem value="30days" className="rounded-md my-0.5 font-medium cursor-pointer focus:bg-primary/10 transition-colors py-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  Last 30 Days
                </div>
              </SelectItem>
              <SelectItem value="year" className="rounded-md my-0.5 font-medium cursor-pointer focus:bg-primary/10 transition-colors py-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  This Year
                </div>
              </SelectItem>
              <SelectItem value="all" className="rounded-md my-0.5 font-medium cursor-pointer focus:bg-primary/10 transition-colors py-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  All Time
                </div>
              </SelectItem>
              <SelectItem value="custom" className="rounded-md my-0.5 font-medium cursor-pointer focus:bg-primary/10 transition-colors py-2 border-t border-border/50 mt-1">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  Custom Range
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {timePeriod === "custom" && (
            <Popover>
              <PopoverTrigger
                className={cn(
                  "inline-flex items-center justify-start h-10 w-full sm:w-[260px] rounded-full border border-border/50 bg-background/40 hover:bg-background/80 px-4 py-2 text-sm text-left font-normal transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd, y")} -{" "}
                      {format(dateRange.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 flex flex-col sm:flex-row rounded-2xl border-border/50 shadow-xl overflow-hidden" align="end">
                <div className="flex flex-col gap-1 p-3 border-b sm:border-b-0 sm:border-r border-border/10 bg-muted/20 min-w-[140px]">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2 pt-1">Quick Select</span>
                  <Button variant="ghost" size="sm" className="justify-start text-left font-medium" onClick={() => setDateRange({ from: subDays(todayStart, 6), to: now })}>Last 7 Days</Button>
                  <Button variant="ghost" size="sm" className="justify-start text-left font-medium" onClick={() => setDateRange({ from: subDays(todayStart, 29), to: now })}>Last 30 Days</Button>
                  <Button variant="ghost" size="sm" className="justify-start text-left font-medium" onClick={() => {
                    const start = new Date(now.getFullYear(), now.getMonth(), 1);
                    setDateRange({ from: start, to: now });
                  }}>This Month</Button>
                  <Button variant="ghost" size="sm" className="justify-start text-left font-medium" onClick={() => {
                    const end = new Date(now.getFullYear(), now.getMonth(), 0);
                    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    setDateRange({ from: start, to: end });
                  }}>Last Month</Button>
                </div>
                <div className="p-2">
                  <Calendar
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={1}
                    className="p-3"
                  />
                </div>
              </PopoverContent>
            </Popover>
          )}

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

      <AnimatePresence mode="wait">
        <motion.div 
          key={timePeriod + (dateRange?.from?.toISOString() || "") + (dateRange?.to?.toISOString() || "")}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          id="finance-visual-report" 
          className="space-y-8 pb-4"
        >
        {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-primary/10 text-primary rounded-2xl shrink-0">
              <DollarSign className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground whitespace-normal break-words">Total Revenue</p>
              <h3 className="text-2xl font-bold mt-1 text-foreground whitespace-normal break-words">₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-primary/10 text-primary rounded-2xl shrink-0">
              <CreditCard className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground whitespace-normal break-words">Online Payments</p>
              <h3 className="text-2xl font-bold mt-1 text-foreground whitespace-normal break-words">₱{onlineRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 rounded-2xl shrink-0">
              <Banknote className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground whitespace-normal break-words">Cash on Pickup</p>
              <h3 className="text-2xl font-bold mt-1 text-foreground whitespace-normal break-words">₱{cashRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-primary/10 text-primary rounded-2xl shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground whitespace-normal break-words">Paid Requests</p>
              <h3 className="text-2xl font-bold mt-1 text-foreground whitespace-normal break-words">{filteredRequests.filter(isCompletedOrPaid).length}</h3>
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
            {revenueOverTime.length > 0 && revenueOverTime.some(d => d.revenue > 0) ? (
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
                    dot={(props: any) => <CustomAnimatedDot {...props} dataCount={revenueOverTime.length} />}
                    activeDot={{ r: 6, strokeWidth: 0, fill: "#0A5C36" }}
                    animationDuration={1000}
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
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground h-full">
                <LucideLineChart className="w-8 h-8 text-muted-foreground/50 mb-2" />
                <p className="font-medium text-sm">No revenue trend data for this period.</p>
              </div>
            )}
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
                    animationDuration={1000}
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
                <LucidePieChart className="w-8 h-8 text-muted-foreground/50 mb-2" />
                <p className="font-medium text-sm">No payment data for this period.</p>
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
                  <Bar dataKey="revenue" fill="#0A5C36" radius={[0, 4, 4, 0]} barSize={32} animationDuration={1000}>
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
                <LucideBarChart className="w-8 h-8 text-muted-foreground/50 mb-2" />
                <p className="font-medium text-sm">No document revenue data for this period.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
