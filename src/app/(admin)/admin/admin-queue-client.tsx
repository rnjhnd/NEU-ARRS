"use client";

import { useState } from "react";
import { Request, RequestStatus } from "@prisma/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateRequestStatus } from "@/app/actions/admin.actions";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, CheckCircle2, Package, Activity, Search, Download, ArrowUpDown, ArrowUp, ArrowDown, FileText, AlertTriangle, Inbox } from "lucide-react";
import { Input } from "@/components/ui/input";
import useSWR from "swr";

export type MappedRequest = Request & { studentName?: string; studentEmail?: string };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function AdminQueueClient({ initialRequests }: { initialRequests: MappedRequest[] }) {
  const { data: requests = initialRequests, mutate } = useSWR<MappedRequest[]>("/api/admin/requests", fetcher, {
    fallbackData: initialRequests,
    refreshInterval: 5000,
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const ITEMS_PER_PAGE = 10;

  const filteredRequests = requests.filter((req) => {
    if (filter !== "ALL" && req.status !== filter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !req.id.toLowerCase().includes(q) && 
        !req.documentType.toLowerCase().includes(q) &&
        !req.studentName?.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  type SortConfig = { key: keyof MappedRequest; direction: "asc" | "desc" } | null;
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    if (!sortConfig) return 0;
    
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    // Handle nulls/undefined for strings
    if (typeof aValue === "string") aValue = aValue.toLowerCase();
    if (typeof bValue === "string") bValue = bValue.toLowerCase();

    if (aValue === undefined || aValue === null) return 1;
    if (bValue === undefined || bValue === null) return -1;

    if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRequests.length / ITEMS_PER_PAGE);
  const paginatedRequests = sortedRequests.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Calculate Stats
  const pendingCount = requests.filter(r => r.status === "PENDING" || r.status === "PENDING_PAYMENT").length;
  const processingCount = requests.filter(r => r.status === "PROCESSING").length;
  const readyCount = requests.filter(r => r.status === "READY_FOR_PICKUP").length;

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRequests.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredRequests.map((r) => r.id)));
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkUpdate = async (newStatus: RequestStatus, cancelReason?: string) => {
    if (selectedIds.size === 0) return;
    setIsUpdating(true);

    const formData = new FormData();
    selectedIds.forEach((id) => formData.append("requestIds", id));
    formData.append("newStatus", newStatus);
    if (cancelReason) formData.append("cancelReason", cancelReason);

    const res = await updateRequestStatus(formData);

    if (res.success) {
      toast.success(`Updated ${selectedIds.size} requests to ${newStatus}.`);
      setSelectedIds(new Set());
      mutate(
        (prev) => prev?.map((r) =>
          selectedIds.has(r.id) ? { ...r, status: newStatus, cancelReason: cancelReason || r.cancelReason } : r
        ),
        { revalidate: false }
      );
    } else {
      toast.error(res.error);
    }
    setIsUpdating(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING": 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-gold/10 dark:text-gold border border-yellow-200 dark:border-gold/20">Pending Docs</span>;
      case "PENDING_PAYMENT": 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-gold/10 dark:text-gold border border-yellow-200 dark:border-gold/20">Pending Payment</span>;
      case "PROCESSING": 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">Processing</span>;
      case "READY_FOR_PICKUP": 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/20 text-primary border border-primary/30">Ready to Pick-up</span>;
      case "COMPLETED": 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary text-white border border-primary">Completed</span>;
      case "CANCELLED": 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">Cancelled</span>;
      default: 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  const exportToCSV = () => {
    if (requests.length === 0) return toast.error("No data to export.");
    const headers = ["Reference ID", "Student Name", "Student Email", "Document", "Purpose", "Payment Method", "Payment Status", "Date", "Status", "Cancel Reason"];
    const rows = requests.map(r => [
      r.id,
      r.studentName || "Unknown",
      r.studentEmail || "No email",
      r.documentType,
      r.purpose,
      r.paymentMethod,
      r.paymentStatus,
      new Date(r.createdAt).toISOString(),
      r.status,
      r.cancelReason || ""
    ]);
    const csvContent = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `neu_requests_export_${format(new Date(), "yyyyMMdd")}.csv`);
    link.click();
  };

  const handleSort = (key: keyof MappedRequest) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const SortableHeader = ({ title, sortKey, alignRight = false, className = "" }: { title: string, sortKey: keyof MappedRequest, alignRight?: boolean, className?: string }) => {
    const isActive = sortConfig?.key === sortKey;
    
    const renderIcon = () => {
      if (isActive) {
        return sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
      }
      return <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />;
    };

    return (
      <TableHead className={`font-semibold text-emerald-800 dark:text-emerald-400 ${alignRight ? "text-right" : ""} ${className}`}>
        <button 
          onClick={() => handleSort(sortKey)}
          className={`flex items-center gap-1.5 hover:text-emerald-950 dark:hover:text-emerald-300 transition-colors py-2 group ${alignRight ? "ml-auto justify-end" : ""}`}
        >
          {alignRight && renderIcon()}
          {title}
          {!alignRight && renderIcon()}
        </button>
      </TableHead>
    );
  };

  return (
    <div className="space-y-8">
      {/* At-A-Glance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-background/60 backdrop-blur-md rounded-2xl border border-border/50 shadow-sm transition-all hover:bg-background/80">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pending Action</p>
              <h3 className="text-3xl font-bold mt-1 text-foreground">{pendingCount}</h3>
            </div>
            <div className="p-3 bg-yellow-100 text-yellow-700 dark:bg-gold/10 dark:text-gold rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-background/60 backdrop-blur-md rounded-2xl border border-border/50 shadow-sm transition-all hover:bg-background/80">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">In Processing</p>
              <h3 className="text-3xl font-bold mt-1 text-foreground">{processingCount}</h3>
            </div>
            <div className="p-3 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl">
              <Activity className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background/60 backdrop-blur-md rounded-2xl border border-border/50 shadow-sm transition-all hover:bg-background/80">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ready for Pickup</p>
              <h3 className="text-3xl font-bold mt-1 text-foreground">{readyCount}</h3>
            </div>
            <div className="p-3 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-xl">
              <Package className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar max-w-full">
          {["ALL", "PENDING", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED"].map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setCurrentPage(1); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                filter === f 
                  ? "bg-foreground text-background shadow-[0_2px_10px_rgba(10,92,54,0.2)]" 
                  : "bg-background/50 backdrop-blur-xl text-muted-foreground hover:bg-muted border-emerald-500/20 border"
              }`}
            >
              {f.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Input 
            placeholder="Search ID, document, or student..." 
            className="pl-9 bg-background/50 backdrop-blur-xl border-emerald-500/20 shadow-[0_2px_10px_rgb(0,0,0,0.02)] rounded-full"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      <Card className="shadow-lg border-emerald-500/10 overflow-hidden bg-background/70 backdrop-blur-xl rounded-3xl pt-0">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 bg-gradient-to-r from-emerald-500/5 to-transparent pb-6 px-8 pt-8">
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Request Queue
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/50 dark:bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 shadow-sm ml-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live
              </span>
            </CardTitle>
            <div className="flex items-center gap-4 mt-1">
              <CardDescription className="text-base text-muted-foreground">Automatically syncing with database.</CardDescription>
              <Button variant="outline" size="sm" onClick={exportToCSV} className="h-7 text-xs bg-background">
                <Download className="w-3 h-3 mr-1" /> Export CSV
              </Button>
            </div>
          </div>
          
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg"
              >
                <span className="text-sm font-semibold text-primary px-3">
                  {selectedIds.size} selected
                </span>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="bg-background shadow-sm hover:text-blue-600"
                  disabled={isUpdating}
                  onClick={() => handleBulkUpdate(RequestStatus.PROCESSING)}
                >
                  Process
                </Button>
                <Button 
                  variant="default" 
                  size="sm"
                  className="shadow-[0_2px_10px_rgba(10,92,54,0.2)]"
                  disabled={isUpdating}
                  onClick={() => handleBulkUpdate(RequestStatus.READY_FOR_PICKUP)}
                >
                  Mark Ready
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm"
                  disabled={isUpdating}
                  onClick={() => handleBulkUpdate(RequestStatus.COMPLETED)}
                >
                  Complete
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  disabled={isUpdating}
                  onClick={() => setCancelDialogOpen(true)}
                >
                  Cancel
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/50 bg-emerald-500/5">
                  <TableHead className="w-[50px] pl-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === sortedRequests.length && sortedRequests.length > 0}
                      onChange={toggleSelectAll}
                      className="block rounded border-input text-primary focus:ring-primary h-4 w-4 transition-all"
                    />
                  </TableHead>
                  <SortableHeader title="Student" sortKey="studentName" />
                  <SortableHeader title="Document" sortKey="documentType" />
                  <SortableHeader title="Payment" sortKey="paymentStatus" alignRight />
                  <SortableHeader title="Date" sortKey="createdAt" alignRight />
                  <SortableHeader title="Status" sortKey="status" alignRight className="pr-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="wait">
                  {filteredRequests.length === 0 && (
                    <motion.tr 
                      key={`empty-${filter}-${searchQuery}`}
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center">
                          <Inbox className="w-8 h-8 text-muted-foreground/50 mb-2" />
                          <p>No active requests in this queue.</p>
                        </div>
                      </TableCell>
                    </motion.tr>
                  )}
                  {paginatedRequests.map((req, i) => (
                    <motion.tr 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      key={`${req.id}-${filter}-${currentPage}-${sortConfig?.key}-${sortConfig?.direction}`}
                      className={`cursor-pointer border-b border-border/50 transition-colors ${selectedIds.has(req.id) ? "bg-emerald-500/10" : "hover:bg-emerald-500/5"}`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).tagName !== "INPUT") toggleSelectRow(req.id);
                      }}
                    >
                      <TableCell className="pl-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(req.id)}
                          onChange={() => toggleSelectRow(req.id)}
                          className="block rounded border-input text-primary focus:ring-primary h-4 w-4 transition-all"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-sm text-foreground">{req.studentName || "Unknown"}</span>
                          <span className="text-[10px] text-muted-foreground">{req.studentEmail || "No email"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-foreground">{req.documentType.replace("_", " ")}</span>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {req.purpose.replace("_", " ")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col gap-0.5 items-end">
                          <span className="capitalize text-sm font-medium">{req.paymentMethod}</span>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {req.paymentStatus.replace(/_/g, " ")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col gap-0.5 items-end">
                          <span className="text-sm font-medium text-foreground">{format(new Date(req.createdAt), "MMM d, yyyy")}</span>
                          <span className="text-[10px] text-muted-foreground">{format(new Date(req.createdAt), "h:mm a")}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex flex-col items-end gap-2">
                          {getStatusBadge(req.status)}

                          {req.status === "COMPLETED" && (
                            <a 
                              href={`/receipt/${req.id}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="inline-flex items-center gap-1 mt-0.5 text-xs leading-none font-medium text-yellow-600 hover:text-yellow-700 dark:text-gold dark:hover:text-gold/80 hover:underline transition-all"
                            >
                              <FileText className="w-3 h-3" />
                              <span>View Receipt</span>
                            </a>
                          )}
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        </CardContent>
        {/* Pagination Footer */}
        {totalPages > 1 && (
          <CardFooter className="flex items-center justify-between border-t border-border px-6 py-4 bg-muted/10">
            <span className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, sortedRequests.length)} of {sortedRequests.length} requests
            </span>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <div className="text-sm font-medium px-2">
                Page {currentPage} of {totalPages}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle className="text-center text-xl">Cancel Request</DialogTitle>
            <DialogDescription className="text-center mt-2">
              Are you sure you want to cancel this request? Please provide a reason below. This action cannot be undone and the student will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <textarea 
              placeholder="e.g. Invalid document requested, incorrect payment amount..." 
              value={cancelReasonInput}
              onChange={(e) => setCancelReasonInput(e.target.value)}
              maxLength={200}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-none transition-all"
              autoFocus
            />
          </div>
          <DialogFooter className="sm:justify-between sm:space-x-2 pt-2">
            <Button variant="ghost" className="w-full sm:w-auto" onClick={() => {
              setCancelDialogOpen(false);
              setCancelReasonInput("");
            }}>Back</Button>
            <Button 
              variant="destructive"
              className="w-full sm:w-auto shadow-sm"
              disabled={!cancelReasonInput.trim() || isUpdating}
              onClick={() => {
                if (!cancelReasonInput.trim()) return toast.error("Reason is required");
                handleBulkUpdate(RequestStatus.CANCELLED, cancelReasonInput);
                setCancelDialogOpen(false);
                setCancelReasonInput("");
              }}
            >
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
