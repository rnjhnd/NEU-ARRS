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
        initial={{ opacity: 0, y: 10 }} 
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center p-12 text-center border rounded-xl border-dashed bg-card mt-8 shadow-sm"
      >
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6 text-primary">
          <FileText className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-bold mb-2 text-foreground">No Requests Found</h3>
        <p className="text-muted-foreground max-w-sm mb-8">
          You haven&apos;t made any document requests yet. Create a new request to get started.
        </p>
        <Link href="/dashboard/new">
          <Button className="shadow-[0_4px_15px_rgba(10,92,54,0.2)] transition-transform hover:scale-105">
            <Plus className="w-4 h-4 mr-2" />
            Create Request
          </Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <Card className="shadow-sm border-border overflow-hidden">
      <CardHeader className="bg-muted/10 border-b border-border pb-6">
        <CardTitle className="text-xl">Request History</CardTitle>
        <CardDescription>A complete log of your academic document requests.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/30">
                <TableHead className="pl-6 font-semibold">Reference ID</TableHead>
                <TableHead className="font-semibold">Document Type</TableHead>
                <TableHead className="font-semibold">Purpose</TableHead>
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="font-semibold">Payment</TableHead>
                <TableHead className="text-right pr-6 font-semibold">Status</TableHead>
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
                    className="border-b border-border hover:bg-muted/40 transition-colors"
                  >
                    <TableCell className="pl-6 font-mono text-xs text-muted-foreground">
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
                    <TableCell className="text-right pr-6">
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
