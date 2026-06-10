"use client";

import { format } from "date-fns";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Request } from "@prisma/client";
import { useState } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { RequestTracker } from "@/components/request-tracker";
import { cancelStudentRequest } from "@/app/actions/request.actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "PENDING": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">Pending Docs</span>;
    case "PENDING_PAYMENT": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">Pending Payment</span>;
    case "PROCESSING": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">Processing</span>;
    case "READY_FOR_PICKUP": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">Ready to Pick-up</span>;
    case "COMPLETED": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Completed</span>;
    case "CANCELLED": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">Cancelled</span>;
    default: 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">{status}</span>;
  }
};

export function RequestList({ requests }: { requests: Request[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const router = useRouter();

  const handleCancelConfirm = async () => {
    if (!cancellingId || !cancelReasonInput.trim()) return;
    const id = cancellingId;
    const reason = cancelReasonInput;
    
    setCancelDialogOpen(false);
    setCancelReasonInput("");
    
    const result = await cancelStudentRequest(id, reason);
    if (result.success) {
      toast.success("Request cancelled successfully.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setCancellingId(null);
  };

  if (requests.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center justify-center p-16 text-center rounded-3xl bg-background/50 backdrop-blur-md border border-emerald-500/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(10,92,54,0.1)] mt-8 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none"></div>
        <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mb-8 text-emerald-600 dark:text-emerald-400 relative">
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: '3s' }}></div>
          <FileText className="h-10 w-10 relative z-10" />
        </div>
        <h3 className="text-2xl font-extrabold mb-3 text-foreground tracking-tight">No Requests Found</h3>
        <p className="text-muted-foreground max-w-md mb-10 text-lg">
          Your document queue is completely clear. Need an official transcript or certificate? Initiate a new request now.
        </p>
        <Link href="/dashboard/new">
          <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_4px_20px_rgba(16,185,129,0.3)] dark:shadow-[0_4px_20px_rgba(16,185,129,0.15)] transition-all hover:scale-105 active:scale-95 rounded-full px-8 text-base h-12">
            <Plus className="w-5 h-5 mr-2" />
            Create Request
          </Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <Card className="shadow-lg border-emerald-500/10 overflow-hidden bg-background/70 backdrop-blur-xl rounded-3xl">
      <CardHeader className="bg-gradient-to-r from-emerald-500/5 to-transparent border-b border-border/50 pb-6 px-8 pt-8">
        <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Request History</CardTitle>
        <CardDescription className="text-base text-muted-foreground">A complete log of your academic document requests.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50 bg-emerald-500/5">
                <TableHead className="pl-8 font-semibold text-emerald-800 dark:text-emerald-400">Reference ID</TableHead>
                <TableHead className="font-semibold text-emerald-800 dark:text-emerald-400">Document Type</TableHead>
                <TableHead className="font-semibold text-emerald-800 dark:text-emerald-400">Purpose</TableHead>
                <TableHead className="font-semibold text-emerald-800 dark:text-emerald-400">Date</TableHead>
                <TableHead className="font-semibold text-emerald-800 dark:text-emerald-400">Payment</TableHead>
                <TableHead className="text-right pr-8 font-semibold text-emerald-800 dark:text-emerald-400">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {requests.map((req, i) => (
                  <React.Fragment key={req.id}>
                    <motion.tr 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                      className={`border-b border-border/50 hover:bg-emerald-500/5 transition-colors cursor-pointer ${expandedId === req.id ? "bg-emerald-500/5" : ""}`}
                    >
                      <TableCell className="pl-8 font-mono text-xs text-muted-foreground font-medium">
                        {req.id.slice(0, 8).toUpperCase()}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {req.documentType.replace("_", " ")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {req.purpose.replace("_", " ")}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(req.createdAt), "MMM d, yyyy")}
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
                          {req.cancelReason && (
                            <p className="text-[10px] text-red-500 max-w-[150px] truncate">Reason: {req.cancelReason}</p>
                          )}
                          {req.status === "COMPLETED" && (
                            <a 
                              href={`/receipt/${req.id}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 mt-0.5 text-xs leading-none font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline transition-all"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Download Receipt</span>
                            </a>
                          )}
                        </div>
                      </TableCell>
                    </motion.tr>
                    <AnimatePresence>
                      {expandedId === req.id && (
                        <motion.tr
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-emerald-500/5 overflow-hidden border-b border-border/50"
                        >
                          <TableCell colSpan={6} className="p-0 border-0">
                            <motion.div 
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="px-6 py-4"
                            >
                              <RequestTracker status={req.status} cancelReason={req.cancelReason} />
                              {(req.status === "PENDING" || req.status === "PENDING_PAYMENT") && (
                                <div className="flex justify-end mt-2 pr-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => {
                                      setCancellingId(req.id);
                                      setCancelDialogOpen(true);
                                    }}
                                    disabled={cancellingId === req.id && !cancelDialogOpen}
                                    className="shadow-sm text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-500 dark:border-red-900/50 dark:hover:bg-red-900/30"
                                  >
                                    {(cancellingId === req.id && !cancelDialogOpen) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                    Cancel Request
                                  </Button>
                                </div>
                              )}
                            </motion.div>
                          </TableCell>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={cancelDialogOpen} onOpenChange={(open) => {
        setCancelDialogOpen(open);
        if (!open) setCancellingId(null);
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-500" />
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
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-none transition-all"
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
              variant="default" 
              className="w-full sm:w-auto bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 shadow-sm border-0"
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
