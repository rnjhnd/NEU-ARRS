"use client";

import { useState } from "react";
import html2canvas from "html2canvas";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Request } from "@prisma/client";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from "recharts";
import { format, subDays } from "date-fns";
import { DollarSign, CreditCard, Banknote, TrendingUp, Download, Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const COLORS = ['#0A5C36', '#eab308'];

export function FinanceClient({ requests }: { requests: Request[] }) {
  const [isExporting, setIsExporting] = useState(false);
  
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
    if (req.amountPaid) return req.amountPaid; // amountPaid is stored in PHP
    if (req.paymentMethod === 'cash') return 150; // Fallback hardcoded PHP for legacy cash
    return 0;
  };

  const isCompletedOrPaid = (req: Request) => 
    req.paymentStatus === 'PAID' || req.paymentStatus === 'CASH_ON_PICKUP';

  // 1. Top Level KPIs
  const totalRevenue = requests.filter(isCompletedOrPaid).reduce((sum, req) => sum + getAmount(req), 0);
  
  const onlineRequests = requests.filter(r => r.paymentMethod === 'online' && r.paymentStatus === 'PAID');
  const onlineRevenue = onlineRequests.reduce((sum, req) => sum + getAmount(req), 0);
  
  const cashRequests = requests.filter(r => r.paymentMethod === 'cash');
  const cashRevenue = cashRequests.reduce((sum, req) => sum + getAmount(req), 0);

  // 2. Revenue Over Time (Last 7 Days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    return format(d, 'MMM dd');
  });

  const revenueOverTime = last7Days.map(dateStr => {
    const dailyRevenue = requests.filter(isCompletedOrPaid).reduce((sum, req) => {
      if (format(new Date(req.createdAt), 'MMM dd') === dateStr) {
        return sum + getAmount(req);
      }
      return sum;
    }, 0);
    return { name: dateStr, revenue: dailyRevenue };
  });

  // 3. Payment Method Distribution
  const paymentMethodData = [
    { name: 'Online', value: onlineRevenue },
    { name: 'Cash on Pickup', value: cashRevenue },
  ].filter(d => d.value > 0);

  // 4. Document Type Revenue
  const documentTypes = [...new Set(requests.map(r => r.documentType))];
  const documentData = documentTypes.map(type => {
    const typeRevenue = requests
      .filter(r => r.documentType === type && isCompletedOrPaid(r))
      .reduce((sum, req) => sum + getAmount(req), 0);
    return { name: type, revenue: typeRevenue };
  }).sort((a, b) => b.revenue - a.revenue);

  const exportToCSV = () => {
    const paidRequests = requests.filter(isCompletedOrPaid);
    if (paidRequests.length === 0) return toast.error("There is no revenue data available to export.");
    
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
      // Small delay to allow toast and Recharts animations to settle
      await new Promise(r => setTimeout(r, 800));
      
      const isDark = document.documentElement.classList.contains("dark");
      
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution
        backgroundColor: isDark ? "#020817" : "#ffffff", // Match Tailwind background
        logging: false,
        useCORS: true,
      });
      
      const image = canvas.toDataURL("image/png", 1.0);
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
      <div className="flex flex-col sm:flex-row justify-end items-center gap-3">
        <Button 
          variant="outline"
          onClick={exportToImage} 
          disabled={isExporting}
          className="w-full sm:w-auto h-10 px-5 rounded-full border-primary/20 text-foreground shadow-sm transition-all hover:bg-muted active:scale-95"
        >
          {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2 text-primary" />}
          {isExporting ? "Capturing..." : "Download Visual Report"}
        </Button>
        <Button onClick={exportToCSV} className="w-full sm:w-auto h-10 px-5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border-none shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all hover:scale-105 active:scale-95">
          <Download className="w-4 h-4 mr-2" />
          Export Data (CSV)
        </Button>
      </div>

      <div id="finance-visual-report" className="space-y-8 pb-4">
        {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-background/60 backdrop-blur-md rounded-2xl border border-border/50 shadow-sm transition-all hover:bg-background/80">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
              <h3 className="text-2xl font-bold mt-1">₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-background/60 backdrop-blur-md rounded-2xl border border-border/50 shadow-sm transition-all hover:bg-background/80">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Online Payments</p>
              <h3 className="text-2xl font-bold mt-1">₱{onlineRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <CreditCard className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background/60 backdrop-blur-md rounded-2xl border border-border/50 shadow-sm transition-all hover:bg-background/80">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Cash on Pickup</p>
              <h3 className="text-2xl font-bold mt-1">₱{cashRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
            <div className="p-3 bg-yellow-500/10 text-yellow-600 dark:bg-gold/10 dark:text-gold rounded-xl">
              <Banknote className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background/60 backdrop-blur-md rounded-2xl border border-border/50 shadow-sm transition-all hover:bg-background/80">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Paid Requests</p>
              <h3 className="text-2xl font-bold mt-1">{requests.filter(isCompletedOrPaid).length}</h3>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trends */}
        <Card className="lg:col-span-2 shadow-lg border-primary/10 overflow-hidden bg-background/70 backdrop-blur-xl rounded-3xl pt-0">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-8">
            <CardTitle className="text-xl font-bold tracking-tight text-foreground">7-Day Revenue Trend</CardTitle>
            <CardDescription>Daily revenue from both online and cash payments.</CardDescription>
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
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Methods Pie */}
        <Card className="shadow-lg border-primary/10 overflow-hidden bg-background/70 backdrop-blur-xl rounded-3xl pt-0">
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
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend content={<CustomLegend />} verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground h-full">
                <p>No payment data yet.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Document Performance Bar Chart */}
        <Card className="lg:col-span-3 shadow-lg border-primary/10 overflow-hidden bg-background/70 backdrop-blur-xl rounded-3xl pt-0">
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
                  <Bar dataKey="revenue" fill="#0A5C36" radius={[0, 4, 4, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground h-full">
                <p>No document revenue data yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
