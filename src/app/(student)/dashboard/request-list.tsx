"use client";

import { format } from "date-fns";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Request } from "@prisma/client";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "PENDING_PAYMENT": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Payment</span>;
    case "PENDING": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Pending</span>;
    case "PROCESSING": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">Processing</span>;
    case "READY_FOR_PICKUP": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 shadow-sm">Ready for Pickup</span>;
    case "COMPLETED": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">Completed</span>;
    case "CANCELLED": 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-500">Cancelled</span>;
    default: 
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">{status}</span>;
  }
};

export function RequestList({ requests }: { requests: Request[] }) {
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
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={req.id}
                    className="border-b border-border/50 hover:bg-emerald-500/5 transition-colors"
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
                      <div className="flex flex-col items-end justify-center">
                        {getStatusBadge(req.status)}
                        {req.cancelReason && (
                          <p className="text-[10px] text-red-500 mt-1.5 max-w-[150px] truncate">Reason: {req.cancelReason}</p>
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
    </Card>
  );
}
