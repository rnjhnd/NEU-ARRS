"use client";

import { Fragment } from "react";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, Banknote, CreditCard, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RequestTracker } from "@/components/request-tracker";
import type { RequestSort, RequestSortKey, StudentRequest } from "@/lib/student-request-model";
import { cn } from "@/lib/utils";

function SortableHeader({ title, field, sort, onSort }: {
  title: string; field: RequestSortKey; sort: RequestSort; onSort: (key: RequestSortKey) => void;
}) {
  const active = sort.key === field;
  const Icon = active ? sort.direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <TableHead className={field === "id" ? "pl-8 w-[14%]" : field === "documentLabel" ? "w-[22%]" : field === "purpose" ? "w-[18%]" : field === "status" ? "pr-8 text-right w-[18%]" : "w-[14%]"} aria-sort={active ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
    <button type="button" onClick={() => onSort(field)} className={"flex items-center gap-2 rounded py-4 font-semibold text-muted-foreground hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-primary " + (field === "status" ? "ml-auto" : "")}>
      {title}<Icon aria-hidden="true" className="h-3 w-3" />
    </button>
  </TableHead>;
}
function StatusBadge({ status, paymentStatus }: Pick<StudentRequest, "status" | "paymentStatus">) {
  const labels = { PENDING_PAYMENT: "Pending Payment", PROCESSING: "Processing", READY_FOR_PICKUP: "Ready to Pick-up", COMPLETED: "Completed", CANCELLED: "Cancelled" };
  return <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
    status === "CANCELLED" ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20" :
      status === "PENDING_PAYMENT" || status === "PROCESSING" ? "bg-yellow-500/10 text-yellow-700 dark:text-gold border-yellow-500/20" :
        "bg-primary/10 text-primary border-primary/20")}>{status === "PENDING_PAYMENT" && (paymentStatus === "PAID" || paymentStatus === "CASH_ON_PICKUP") ? "Awaiting Registrar" : labels[status]}</span>;
}

export function RequestHistoryTable({ items, sort, onSort, expandedId, onExpand, onCancel, onPay, payingId, cancellationOpen, actionsDisabled }: {
  items: StudentRequest[]; sort: RequestSort; onSort: (key: RequestSortKey) => void;
  expandedId: string | null; onExpand: (id: string) => void; onCancel: (id: string) => void;
  onPay: (id: string) => void; payingId: string | null; cancellationOpen: boolean; actionsDisabled: boolean;
}) {
  return <Table className="table-fixed min-w-[1000px]">
    <TableHeader><TableRow className="border-b border-border/50 hover:bg-transparent">
      <SortableHeader title="Reference ID" field="id" sort={sort} onSort={onSort} />
      <SortableHeader title="Document Type" field="documentLabel" sort={sort} onSort={onSort} />
      <SortableHeader title="Purpose" field="purpose" sort={sort} onSort={onSort} />
      <SortableHeader title="Last Updated" field="updatedAt" sort={sort} onSort={onSort} />
      <SortableHeader title="Payment" field="paymentStatus" sort={sort} onSort={onSort} />
      <SortableHeader title="Status" field="status" sort={sort} onSort={onSort} />
    </TableRow></TableHeader>
    <TableBody>{items.map(request => {
      const expanded = expandedId === request.id;
      const busy = payingId !== null || cancellationOpen || actionsDisabled;
      return <Fragment key={request.id}>
        <TableRow onClick={() => onExpand(request.id)} className={cn("cursor-pointer border-b border-border/40 last:border-0 hover:bg-primary/5 transition-colors", expanded && "bg-primary/5")}>
          <TableCell className="pl-8 py-5"><button type="button" aria-label={"View request " + request.id} aria-expanded={expanded}
            aria-controls={expanded ? "request-details-" + request.id : undefined}
            onClick={event => { event.stopPropagation(); onExpand(request.id); }} className="font-mono font-semibold text-xs rounded-lg border border-primary/15 bg-primary/5 text-primary px-2.5 py-1.5">
            {"#" + request.id.slice(0, 8).toUpperCase()}
          </button></TableCell>
          <TableCell className="py-5 font-semibold whitespace-normal">{request.documentLabel}</TableCell>
          <TableCell className="py-5 text-muted-foreground whitespace-normal">{request.purpose.replace(/_/g, " ")}</TableCell>
          <TableCell className="py-5 text-muted-foreground">{format(new Date(request.updatedAt), "MMM d, yyyy")}</TableCell>
          <TableCell className="py-5 whitespace-normal"><div className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize " + (request.paymentMethod === "online" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-500")}>{request.paymentMethod === "online" ? <CreditCard aria-hidden="true" className="size-3.5" /> : <Banknote aria-hidden="true" className="size-3.5" />}{request.paymentMethod}</div><p className="mt-1 text-xs text-muted-foreground">{request.paymentStatus.replace(/_/g, " ")}</p></TableCell>
          <TableCell className="pr-8 py-5 text-right"><StatusBadge status={request.status} paymentStatus={request.paymentStatus} /></TableCell>
        </TableRow>
        {expanded && <TableRow id={"request-details-" + request.id}><TableCell colSpan={6} className="bg-primary/5">
          <RequestTracker request={request} />
          {request.status === "PENDING_PAYMENT" && <p className="pb-3 text-sm">The registrar must verify your academic identity against school records before processing. Payment does not replace identity verification.</p>}
          <div className="flex justify-end gap-2 pb-3">
            {(request.paymentStatus === "PAID" || (request.paymentStatus === "CASH_ON_PICKUP" && request.status === "COMPLETED")) &&
              <Button nativeButton={false} render={<a href={"/receipt/" + request.id} target="_blank" rel="noreferrer" />} variant="outline" size="sm">
                <FileText aria-hidden="true" className="w-4 h-4" />View Official Receipt
              </Button>}
            {request.status === "PENDING_PAYMENT" && <>
              {request.paymentMethod === "online" && request.paymentStatus === "UNPAID" &&
                <Button size="sm" disabled={busy} onClick={() => onPay(request.id)}>
                  {payingId === request.id && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Pay Now
                </Button>}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onCancel(request.id)}>Cancel Request</Button>
            </>}
          </div>
        </TableCell></TableRow>}
      </Fragment>;
    })}</TableBody>
  </Table>;
}
