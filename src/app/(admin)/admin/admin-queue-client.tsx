"use client";

import { useState, useEffect } from "react";
import { Request, RequestStatus } from "@prisma/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateRequestStatus } from "@/app/actions/admin.actions";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, CheckCircle2, Package, Activity, Search, Download, ArrowUpDown, ArrowUp, ArrowDown, FileText, AlertTriangle, Inbox, SearchX, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  const [editingRequest, setEditingRequest] = useState<MappedRequest | null>(null);
  const [editStatus, setEditStatus] = useState<string>("");
  const [sendCorrection, setSendCorrection] = useState(false);
  const ITEMS_PER_PAGE = 10;

  // Fix: Reset pagination when filters or search change to prevent out-of-bounds blank pages
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filter]);

  const STATUS_ORDER: Record<string, number> = {
    PENDING_PAYMENT: 0,
    PROCESSING: 1,
    READY_FOR_PICKUP: 2,
    COMPLETED: 3,
    CANCELLED: 4,
  };

  const filteredRequests = requests.filter((req) => {
    if (filter !== "ALL" && req.status !== filter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !req.id.toLowerCase().includes(q) && 
        !req.documentType.toLowerCase().includes(q) &&
        !req.studentName?.toLowerCase().includes(q) &&
        !req.studentEmail?.toLowerCase().includes(q) &&
        !req.purpose.toLowerCase().replace(/_/g, " ").includes(q) &&
        !req.paymentMethod.toLowerCase().includes(q) &&
        !req.paymentStatus.toLowerCase().replace(/_/g, " ").includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  type SortConfig = { key: keyof MappedRequest; direction: "asc" | "desc" } | null;
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "updatedAt", direction: "desc" });

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
  const pendingCount = requests.filter(r => r.status === "PENDING_PAYMENT").length;
  const processingCount = requests.filter(r => r.status === "PROCESSING").length;
  const readyCount = requests.filter(r => r.status === "READY_FOR_PICKUP").length;

  const canProcess = selectedIds.size > 0 && Array.from(selectedIds).every((id) => {
    const req = requests.find((r) => r.id === id);
    return req && req.status === "PENDING_PAYMENT";
  });

  const canMarkReady = selectedIds.size > 0 && Array.from(selectedIds).every((id) => {
    const req = requests.find((r) => r.id === id);
    return req && req.status === "PROCESSING";
  });

  const canComplete = selectedIds.size > 0 && Array.from(selectedIds).every((id) => {
    const req = requests.find((r) => r.id === id);
    return req && req.status === "READY_FOR_PICKUP";
  });

  const canCancel = selectedIds.size > 0 && Array.from(selectedIds).every((id) => {
    const req = requests.find((r) => r.id === id);
    return req && req.status !== "COMPLETED" && req.status !== "CANCELLED";
  });

  const toggleSelectAll = () => {
    // Safety Fix: Only select currently visible items on this page, not everything hidden across all pages
    const pageIds = paginatedRequests.map((r) => r.id);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
    
    if (allSelected) {
      const next = new Set(selectedIds);
      pageIds.forEach(id => next.delete(id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      pageIds.forEach(id => next.add(id));
      setSelectedIds(next);
    }
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
      toast.success(`Successfully updated ${selectedIds.size} request(s) to ${newStatus.replace(/_/g, " ")}.`);
      setSelectedIds(new Set());
      mutate(
        (prev) => prev?.map((r) =>
          selectedIds.has(r.id) ? { ...r, status: newStatus, cancelReason: cancelReason || r.cancelReason } : r
        ),
        { revalidate: false }
      );
    } else {
      toast.error(res.error || "Failed to process the bulk update.");
    }
    setIsUpdating(false);
  };

  const handleEditSave = async () => {
    if (!editingRequest || !editStatus) return;
    setIsUpdating(true);
    
    const formData = new FormData();
    formData.append("requestIds", editingRequest.id);
    formData.append("newStatus", editStatus);
    formData.append("isOverride", "true");
    if (sendCorrection) {
      formData.append("sendCorrectionEmail", "true");
    }
    
    const res = await updateRequestStatus(formData);
    if (res.success) {
      const isOverride = STATUS_ORDER[editStatus] < STATUS_ORDER[editingRequest.status];
      if (isOverride) {
        toast.success(`Request status manually reversed to ${editStatus.replace(/_/g, " ")}.`);
      } else {
        toast.success(`Request status successfully updated to ${editStatus.replace(/_/g, " ")}.`);
      }
      
      mutate(
        (prev) => prev?.map((r) => r.id === editingRequest.id ? { ...r, status: editStatus as RequestStatus } : r),
        { revalidate: false }
      );
      setEditingRequest(null);
    } else {
      toast.error(res.error || "Failed to process the update.");
    }
    setIsUpdating(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING_PAYMENT": 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-700 dark:bg-gold/10 dark:text-gold border border-yellow-500/20 dark:border-gold/20">Pending Payment</span>;
      case "PROCESSING": 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-700 dark:bg-gold/10 dark:text-gold border border-yellow-500/20 dark:border-gold/20">Processing</span>;
      case "READY_FOR_PICKUP": 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary dark:bg-primary/20 border border-primary/20 dark:border-primary/30">Ready to Pick-up</span>;
      case "COMPLETED": 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary dark:bg-primary/20 border border-primary/20 dark:border-primary/30">Completed</span>;
      case "CANCELLED": 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-400 border border-red-500/20 dark:border-red-500/30">Cancelled</span>;
      default: 
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400 border border-slate-500/20">{status}</span>;
    }
  };

  const exportToCSV = () => {
    if (requests.length === 0) return toast.error("There is no data available to export.");
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
    if (filteredRequests.length <= 1) {
      return (
        <TableHead className={`font-semibold text-emerald-800 dark:text-emerald-400 ${alignRight ? "text-right" : ""} ${className}`}>
          <div className={`flex items-center gap-1.5 py-2 ${alignRight ? "ml-auto justify-end" : ""}`}>
            {title}
          </div>
        </TableHead>
      );
    }

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-yellow-500/10 text-yellow-600 dark:bg-gold/10 dark:text-gold rounded-2xl shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground whitespace-normal break-words">Pending Action</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground whitespace-normal break-words">{pendingCount}</h3>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-slate-500/10 text-slate-600 dark:text-slate-400 rounded-2xl shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground whitespace-normal break-words">In Processing</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground whitespace-normal break-words">{processingCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-primary/10 text-primary rounded-2xl shrink-0">
              <Package className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground whitespace-normal break-words">Ready for Pickup</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground whitespace-normal break-words">{readyCount}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-muted/50 p-1.5 rounded-full overflow-x-auto no-scrollbar max-w-full shadow-sm border border-border/50">
          {["ALL", "PENDING_PAYMENT", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED"].map((f) => {
            const getLabel = (filterName: string) => {
              if (filterName === "ALL") return "All";
              if (filterName === "PENDING_PAYMENT") return "Pending Payment";
              if (filterName === "PROCESSING") return "Processing";
              if (filterName === "READY_FOR_PICKUP") return "Ready for Pickup";
              if (filterName === "COMPLETED") return "Completed";
              return filterName;
            };
            return (
              <button
                key={f}
                onClick={() => { setFilter(f); setCurrentPage(1); }}
                className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
                  filter === f 
                    ? "bg-background text-foreground shadow-[0_2px_10px_rgb(0,0,0,0.05)] dark:shadow-[0_2px_10px_rgb(0,0,0,0.2)]" 
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                }`}
              >
                {getLabel(f)}
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-80 group">
          <Search className="absolute z-10 left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
          <Input 
            placeholder="Search name, email, or ID..." 
            className="pl-10 pr-5 truncate bg-background/40 hover:bg-background/80 focus:bg-background backdrop-blur-sm border-border/50 shadow-[0_2px_10px_rgba(0,0,0,0.02)] dark:shadow-none rounded-full h-10 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/30"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />
        </div>
      </div>

      <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0 gap-0 !pb-0">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent !py-6 px-8">
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Active Request Queue
            </CardTitle>
            <div className="flex items-center gap-4 mt-1">
              <CardDescription className="text-base text-muted-foreground">Automatically syncing with database.</CardDescription>
              <Button size="sm" onClick={exportToCSV} className="h-9 px-5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border-none shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all hover:scale-105 active:scale-95">
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </Button>
            </div>
          </div>
          
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-1 bg-background/95 backdrop-blur-md border border-border/50 p-1.5 rounded-full shadow-md max-w-full overflow-x-auto no-scrollbar"
              >
                <span className="text-sm font-medium text-muted-foreground px-3 border-r border-border/50 mr-1">
                  <span className="font-semibold text-foreground">{selectedIds.size}</span> selected
                </span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="rounded-full h-8 px-4 text-xs font-medium hover:bg-yellow-500/10 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors"
                  disabled={isUpdating || !canProcess}
                  onClick={() => handleBulkUpdate(RequestStatus.PROCESSING)}
                >
                  Process
                </Button>
                <Button 
                  variant="default" 
                  size="sm"
                  className="rounded-full h-8 px-4 text-xs font-medium shadow-[0_2px_10px_rgba(10,92,54,0.2)] transition-colors"
                  disabled={isUpdating || !canMarkReady}
                  onClick={() => handleBulkUpdate(RequestStatus.READY_FOR_PICKUP)}
                >
                  Mark Ready
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="rounded-full h-8 px-4 text-xs font-medium hover:bg-primary/10 hover:text-primary transition-colors"
                  disabled={isUpdating || !canComplete}
                  onClick={() => handleBulkUpdate(RequestStatus.COMPLETED)}
                >
                  Complete
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="rounded-full h-8 px-4 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400 transition-colors"
                  disabled={isUpdating || !canCancel}
                  onClick={() => setCancelDialogOpen(true)}
                >
                  Cancel
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto pb-4">
            <Table className="table-fixed min-w-[1000px]">
              <TableHeader>
                <TableRow className="border-b border-border/50 bg-transparent hover:bg-transparent">
                  <TableHead className="w-[50px] pl-8">
                    <input
                      type="checkbox"
                      checked={paginatedRequests.length > 0 && paginatedRequests.every(r => selectedIds.has(r.id))}
                      onChange={toggleSelectAll}
                      className="block rounded border-input accent-primary focus:ring-primary h-4 w-4 transition-all cursor-pointer"
                    />
                  </TableHead>
                  <SortableHeader title="Student" sortKey="studentName" className="w-[20%]" />
                  <SortableHeader title="Document" sortKey="documentType" className="w-[25%]" />
                  <SortableHeader title="Payment" sortKey="paymentStatus" alignRight className="w-[15%]" />
                  <SortableHeader title="Last Updated" sortKey="updatedAt" alignRight className="w-[15%]" />
                  <SortableHeader title="Status" sortKey="status" alignRight className="pr-8 w-[20%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredRequests.length === 0 && (
                    <motion.tr 
                      key="empty-state"
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                      transition={{ duration: 0.15 }}
                    >
                      <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center">
                          {requests.length === 0 ? (
                            <>
                              <Inbox className="w-8 h-8 text-muted-foreground/50 mb-2" />
                              <p>No active requests in this queue.</p>
                            </>
                          ) : (filter !== "ALL" && !requests.some(r => r.status === filter)) ? (
                            <>
                              <Filter className="w-8 h-8 text-muted-foreground/50 mb-2" />
                              <p>No requests found with this status.</p>
                            </>
                          ) : (
                            <>
                              <SearchX className="w-8 h-8 text-muted-foreground/50 mb-2" />
                              <p>No requests found matching your search.</p>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </motion.tr>
                  )}
                  {paginatedRequests.map((req, i) => (
                    <motion.tr 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      key={req.id}
                      className={`border-b border-border/50 last:border-0 hover:bg-primary/5 transition-colors cursor-pointer ${selectedIds.has(req.id) ? "bg-primary/10" : ""}`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).tagName !== "INPUT") {
                          setEditingRequest(req);
                          setEditStatus(req.status);
                        }
                      }}
                    >
                      <TableCell className="pl-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(req.id)}
                          onChange={() => toggleSelectRow(req.id)}
                          className="block rounded border-input accent-primary focus:ring-primary h-4 w-4 transition-all cursor-pointer"
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
                          <span className="font-medium text-foreground">{req.documentType}</span>
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
                          <span className="text-sm font-medium text-foreground">{format(new Date(req.updatedAt), "MMM d, yyyy")}</span>
                          <span className="text-[10px] text-muted-foreground">{format(new Date(req.updatedAt), "h:mm a")}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex flex-col items-end gap-2">
                          {getStatusBadge(req.status)}
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
                if (!cancelReasonInput.trim()) return toast.error("A cancellation reason is required to proceed.");
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

      {/* Edit Details Modal */}
      <Dialog open={!!editingRequest} onOpenChange={(open) => { if (!open) setEditingRequest(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-center text-xl">Request Details</DialogTitle>
            <DialogDescription className="text-center mt-2">
              View full details or manually update the status for this specific request.
            </DialogDescription>
          </DialogHeader>

          {editingRequest && (
            <div className="space-y-6 py-4">
              <div className="flex flex-row items-center justify-between py-2.5 px-4 bg-muted/30 rounded-xl border border-border/50">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Status</span>
                  {getStatusBadge(editingRequest.status)}
                </div>
                {editingRequest.status === "COMPLETED" && (
                  <a 
                    href={`/receipt/${editingRequest.id}`} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20 dark:bg-gold/10 dark:text-gold dark:hover:bg-gold/20 transition-all border border-yellow-500/20 dark:border-gold/20 shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View Official Receipt</span>
                  </a>
                )}
              </div>

              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm bg-card p-4 rounded-xl border border-border shadow-sm">
                <div className="col-span-2">
                  <span className="text-muted-foreground block mb-0.5 text-[11px] uppercase tracking-wider font-semibold">Reference ID</span>
                  <span className="font-mono font-medium text-foreground">#{editingRequest.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <span className="text-muted-foreground block mb-0.5 text-[11px] uppercase tracking-wider font-semibold">Date Submitted</span>
                  <span className="font-medium text-foreground">{format(new Date(editingRequest.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <span className="text-muted-foreground block mb-0.5 text-[11px] uppercase tracking-wider font-semibold">Last Updated</span>
                  <span className="font-medium text-foreground">{format(new Date(editingRequest.updatedAt), "MMM d, yyyy 'at' h:mm a")}</span>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <span className="text-muted-foreground block mb-0.5 text-[11px] uppercase tracking-wider font-semibold">Student Name</span>
                  <span className="font-medium text-foreground">{editingRequest.studentName || "Unknown"}</span>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <span className="text-muted-foreground block mb-0.5 text-[11px] uppercase tracking-wider font-semibold">Student Email</span>
                  <span className="font-medium text-foreground">{editingRequest.studentEmail || "No email"}</span>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <span className="text-muted-foreground block mb-0.5 text-[11px] uppercase tracking-wider font-semibold">Document Type</span>
                  <span className="font-medium text-foreground">{editingRequest.documentType}</span>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <span className="text-muted-foreground block mb-0.5 text-[11px] uppercase tracking-wider font-semibold">Purpose</span>
                  <span className="font-medium text-foreground capitalize">{editingRequest.purpose.replace(/_/g, " ").toLowerCase()}</span>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <span className="text-muted-foreground block mb-0.5 text-[11px] uppercase tracking-wider font-semibold">Payment Method</span>
                  <span className="font-medium text-foreground capitalize">{editingRequest.paymentMethod.replace(/_/g, " ").toLowerCase()}</span>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <span className="text-muted-foreground block mb-0.5 text-[11px] uppercase tracking-wider font-semibold">Payment Status</span>
                  <span className="font-medium text-foreground capitalize">{editingRequest.paymentStatus.replace(/_/g, " ").toLowerCase()}</span>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-border/50">
                <span className="text-sm font-semibold text-foreground block mb-3">Update Status</span>
                <Select value={editStatus} onValueChange={(val) => { if (val) setEditStatus(val); }} disabled={isUpdating}>
                  <SelectTrigger className="w-full h-10 rounded-lg border-border/50 bg-background shadow-sm hover:bg-muted/50 transition-colors">
                    <SelectValue placeholder="Select status">
                      <div className="flex items-center gap-2 capitalize">
                        <div className={`w-2 h-2 rounded-full ${
                          editStatus === 'PENDING' || editStatus === 'PENDING_PAYMENT' || editStatus === 'PROCESSING' ? 'bg-yellow-500 dark:bg-gold' :
                          editStatus === 'CANCELLED' ? 'bg-destructive' : 'bg-primary'
                        }`} />
                        {editStatus.replace(/_/g, " ").toLowerCase()}
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false} className="border-border/40 shadow-lg backdrop-blur-xl bg-background/95 min-w-[200px] p-1">
                    {(editingRequest.paymentMethod === "CASHIER" || editStatus === "PENDING_PAYMENT") && (
                      <SelectItem value="PENDING_PAYMENT" className="cursor-pointer focus:bg-primary/10 focus:text-primary transition-colors py-2 rounded-md">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-yellow-500 dark:bg-gold" />
                          Pending Payment
                        </div>
                      </SelectItem>
                    )}
                    <SelectItem value="PROCESSING" className="cursor-pointer focus:bg-primary/10 focus:text-primary transition-colors py-2 rounded-md">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-500 dark:bg-gold" />
                        Processing
                      </div>
                    </SelectItem>
                    <SelectItem value="READY_FOR_PICKUP" className="cursor-pointer focus:bg-primary/10 focus:text-primary transition-colors py-2 rounded-md">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        Ready to Pick-up
                      </div>
                    </SelectItem>
                    <SelectItem value="COMPLETED" className="cursor-pointer focus:bg-primary/10 focus:text-primary transition-colors py-2 rounded-md">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        Completed
                      </div>
                    </SelectItem>
                    <SelectItem value="CANCELLED" className="cursor-pointer focus:bg-primary/10 focus:text-primary transition-colors py-2 rounded-md">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-destructive" />
                        Cancelled
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                {STATUS_ORDER[editStatus] < STATUS_ORDER[editingRequest.status] && (
                  <div className="flex items-center space-x-2 mt-4">
                    <Checkbox 
                      id="send-correction" 
                      checked={sendCorrection} 
                      onCheckedChange={(checked) => setSendCorrection(checked === true)} 
                      disabled={isUpdating}
                    />
                    <Label htmlFor="send-correction" className="text-sm cursor-pointer text-yellow-600 dark:text-yellow-500 font-medium">
                      Send automated correction email for status reversal
                    </Label>
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-2">
                  You can manage the status directly from this view. If you are fixing a mistake and moving the status backward, consider sending a correction email.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-between sm:space-x-2">
            <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setEditingRequest(null)}>Close</Button>
            <Button 
              className="w-full sm:w-auto"
              disabled={isUpdating || !editingRequest || editingRequest.status === editStatus}
              onClick={handleEditSave}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
