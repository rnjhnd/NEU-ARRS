"use client";

import { format } from "date-fns";
import { FileText, Plus, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Request } from "@prisma/client";
import { useState } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { RequestTracker } from "@/components/request-tracker";
import { cancelStudentRequest, createRepaymentSession } from "@/app/actions/request.actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { NewRequestButton } from "./new-request-button";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "PENDING_PAYMENT": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-yellow-500/10 text-yellow-700 dark:bg-gold/10 dark:text-gold border border-yellow-500/20 dark:border-gold/20">Pending Payment</span>;
    case "PROCESSING": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-yellow-500/10 text-yellow-700 dark:bg-gold/10 dark:text-gold border border-yellow-500/20 dark:border-gold/20">Processing</span>;
    case "READY_FOR_PICKUP": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-primary/10 text-primary dark:bg-primary/20 border border-primary/20 dark:border-primary/30">Ready to Pick-up</span>;
    case "COMPLETED": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-primary/10 text-primary dark:bg-primary/20 border border-primary/20 dark:border-primary/30">Completed</span>;
    case "CANCELLED": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-400 border border-red-500/20 dark:border-red-500/30">Cancelled</span>;
    default: 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-slate-500/10 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400 border border-slate-500/20">{status}</span>;
  }
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function RequestList({ requests: initialRequests, isMaintenanceMode = false }: { requests: Request[], isMaintenanceMode?: boolean }) {
  const { data: localRequests = initialRequests, mutate } = useSWR<Request[]>("/api/student/requests", fetcher, {
    fallbackData: initialRequests,
    refreshInterval: 5000,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: keyof Request; direction: "asc" | "desc" } | null>({ key: "updatedAt", direction: "desc" });
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const router = useRouter();

  // Keep track of previous requests to detect status changes
  const prevRequestsRef = React.useRef<Request[]>(initialRequests);

  React.useEffect(() => {
    if (!localRequests) return;
    
    localRequests.forEach(newReq => {
      const oldReq = prevRequestsRef.current.find(r => r.id === newReq.id);
      if (oldReq && oldReq.status !== newReq.status) {
        // Status has changed!
        if (newReq.status === "READY_FOR_PICKUP") {
          toast.success(`Update! Your ${newReq.documentType.replace("_", " ")} is now Ready for Pickup!`);
        } else if (newReq.status === "COMPLETED") {
          toast.success(`Success! Your request for ${newReq.documentType.replace("_", " ")} is completed.`);
        } else if (newReq.status === "PROCESSING") {
          toast.info(`Your ${newReq.documentType.replace("_", " ")} is now being processed.`);
        }
      }
    });

    prevRequestsRef.current = localRequests;
  }, [localRequests]);

  const handleSort = (key: keyof Request) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedRequests = [...localRequests].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    const valA = a[key];
    const valB = b[key];
    if (valA === null) return 1;
    if (valB === null) return -1;
    if (valA < valB) return direction === "asc" ? -1 : 1;
    if (valA > valB) return direction === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sortedRequests.length / ITEMS_PER_PAGE));
  const paginatedRequests = sortedRequests.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const SortableHeader = ({ title, sortKey, alignRight = false, className = "" }: { title: string, sortKey: keyof Request, alignRight?: boolean, className?: string }) => {
    if (localRequests.length <= 1) {
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
      <TableHead className={`font-semibold text-primary dark:text-primary ${alignRight ? "text-right" : ""} ${className}`}>
        <button 
          onClick={() => handleSort(sortKey)}
          className={`flex items-center gap-1.5 hover:text-primary dark:hover:text-primary-foreground/80 transition-colors py-2 group ${alignRight ? "ml-auto justify-end" : ""}`}
        >
          {alignRight && renderIcon()}
          {title}
          {!alignRight && renderIcon()}
        </button>
      </TableHead>
    );
  };

  const handleCancelConfirm = async () => {
    if (!cancellingId || !cancelReasonInput.trim()) return;
    const id = cancellingId;
    const reason = cancelReasonInput;
    
    setCancelDialogOpen(false);
    setCancelReasonInput("");
    
    const result = await cancelStudentRequest(id, reason);
    if (result.success) {
      toast.success("Request cancelled successfully.");
      mutate();
    } else {
      toast.error(result.error || "Failed to cancel the request.");
    }
    setCancellingId(null);
  };

  const handlePayNow = async (id: string) => {
    setPayingId(id);
    const result = await createRepaymentSession(id);
    if (result.success && result.redirectUrl) {
      window.location.href = result.redirectUrl;
    } else {
      toast.error(result.error || "Failed to initialize payment session.");
      setPayingId(null);
    }
  };

  if (localRequests.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center justify-center p-16 text-center rounded-3xl bg-background/50 backdrop-blur-md border border-primary/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(10,92,54,0.1)] mt-8 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none"></div>
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-8 text-primary dark:text-primary relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '3s' }}></div>
          <FileText className="h-10 w-10 relative z-10" />
        </div>
        <h3 className="text-2xl font-extrabold mb-3 text-foreground tracking-tight">No Requests Found</h3>
        <p className="text-muted-foreground max-w-md mb-10 text-lg">
          Your document queue is completely clear. Need an official transcript or certificate? Initiate a new request now.
        </p>
        <NewRequestButton 
          isMaintenanceMode={isMaintenanceMode}
          className="bg-primary hover:bg-primary/90 text-white shadow-[0_4px_20px_rgba(10,92,54,0.3)] dark:shadow-[0_4px_20px_rgba(10,92,54,0.15)] transition-all hover:scale-105 active:scale-95 rounded-full px-8 text-base h-12"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create Request
        </NewRequestButton>
      </motion.div>
    );
  }

  return (
    <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0 gap-0 !pb-0">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-8">
        <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Request History</CardTitle>
        <CardDescription className="text-base text-muted-foreground">A complete log of your academic document requests.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="w-full overflow-x-auto pb-4">
          <Table className="table-fixed min-w-[1000px]">
            <TableHeader>
              <TableRow className="border-b border-border/50 bg-transparent hover:bg-transparent">
                <SortableHeader title="Reference ID" sortKey="id" className="pl-8 w-[15%]" />
                <SortableHeader title="Document Type" sortKey="documentType" className="w-[22%]" />
                <SortableHeader title="Purpose" sortKey="purpose" className="w-[15%]" />
                <SortableHeader title="Last Updated" sortKey="updatedAt" className="w-[15%]" />
                <SortableHeader title="Payment" sortKey="paymentStatus" className="w-[15%]" />
                <SortableHeader title="Status" sortKey="status" alignRight className="pr-8 w-[18%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {paginatedRequests.map((req, i) => (
                  <React.Fragment key={req.id}>
                    <motion.tr 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                      className={`border-b border-border/50 last:border-0 hover:bg-primary/5 transition-colors cursor-pointer ${expandedId === req.id ? "bg-primary/5" : ""}`}
                    >
                      <TableCell className="pl-8">
                        <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 font-mono text-xs font-semibold text-secondary-foreground ring-1 ring-inset ring-border/50 shadow-sm transition-colors hover:bg-secondary/80">
                          #{req.id.slice(0, 8).toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {req.documentType}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {req.purpose.replace("_", " ")}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-medium">
                        {format(new Date(req.updatedAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="capitalize text-sm font-medium">{req.paymentMethod}</span>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{req.paymentStatus.replace(/_/g, " ")}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex flex-col items-end justify-center gap-2">
                          {getStatusBadge(req.status)}
                        </div>
                      </TableCell>
                    </motion.tr>
                    <AnimatePresence>
                      {expandedId === req.id && (
                        <tr>
                          <TableCell colSpan={6} className="p-0 border-0">
                            <motion.div 
                              initial={{ opacity: 0, height: 0, y: -10 }}
                              animate={{ opacity: 1, height: "auto", y: 0 }}
                              exit={{ opacity: 0, height: 0, y: -10 }}
                              transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                              className="bg-primary/5 overflow-hidden border-b border-border/50"
                            >
                              <div className="px-6 py-4">
                              <RequestTracker request={req} />
                              <div className="flex justify-end mt-2 pr-2 pb-2 gap-2">
                                {(req.paymentStatus === "PAID" || (req.paymentStatus === "CASH_ON_PICKUP" && req.status === "COMPLETED")) && (
                                  <a href={`/receipt/${req.id}`} target="_blank" rel="noreferrer">
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      className="font-semibold transition-all duration-300 text-yellow-600 border border-yellow-600/20 bg-yellow-600/5 hover:bg-yellow-600 hover:text-white dark:text-gold dark:border-gold/20 dark:bg-gold/5 dark:hover:bg-gold dark:hover:text-black shadow-sm hover:shadow-md active:scale-95"
                                    >
                                      <FileText className="w-4 h-4 mr-2" />
                                      View Official Receipt
                                    </Button>
                                  </a>
                                )}
                                {req.status === "PENDING_PAYMENT" && (
                                  <>
                                    {req.paymentMethod === "online" && (
                                      <Button 
                                        variant="default" 
                                        size="sm" 
                                        onClick={() => handlePayNow(req.id)}
                                        disabled={payingId === req.id || cancellingId === req.id}
                                        className="font-semibold transition-all duration-300 shadow-sm hover:shadow-md active:scale-95"
                                      >
                                        {payingId === req.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                        Pay Now
                                      </Button>
                                    )}
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      onClick={() => {
                                        setCancellingId(req.id);
                                        setCancelDialogOpen(true);
                                      }}
                                      disabled={(cancellingId === req.id && !cancelDialogOpen) || payingId === req.id}
                                      className="font-semibold transition-all duration-300 text-destructive border border-destructive/20 bg-destructive/5 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive shadow-sm hover:shadow-md active:scale-95"
                                    >
                                      {(cancellingId === req.id && !cancelDialogOpen) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                      Cancel Request
                                    </Button>
                                  </>
                                )}
                              </div>
                              </div>
                            </motion.div>
                          </TableCell>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {totalPages > 1 && (
        <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-0 border-t border-border/50 px-4 sm:px-8 py-4 bg-muted/5">
          <span className="text-sm font-medium text-muted-foreground text-center sm:text-left">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, sortedRequests.length)} of {sortedRequests.length} requests
          </span>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="w-24 rounded-full border-border/50 hover:bg-background"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <div className="text-sm font-semibold text-foreground px-2 whitespace-nowrap">
              Page {currentPage} of {totalPages}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-24 rounded-full border-border/50 hover:bg-background"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </CardFooter>
      )}

      <Dialog open={cancelDialogOpen} onOpenChange={(open) => {
        setCancelDialogOpen(open);
        if (!open) setCancellingId(null);
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle className="text-center text-xl">Cancel Request</DialogTitle>
            <DialogDescription className="text-center mt-2">
              Are you sure you want to cancel this request? Please provide a reason below. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <textarea 
              placeholder="e.g. Requested the wrong document, no longer needed..." 
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
              setCancellingId(null);
            }}>Back</Button>
            <Button 
              variant="destructive"
              className="w-full sm:w-auto shadow-sm"
              disabled={!cancelReasonInput.trim()}
              onClick={handleCancelConfirm}
            >
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
