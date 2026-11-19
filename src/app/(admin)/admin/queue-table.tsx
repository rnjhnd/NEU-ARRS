"use client";

import { format } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, Banknote, CreditCard, User } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { queueStatusLabels, type QueueItem, type QueueSort } from "@/lib/admin-queue-model";

function SortableHeader({ title, field, sort, onSort }: { title: string; field: QueueSort["key"]; sort: QueueSort; onSort: (field: QueueSort["key"]) => void }) {
  const active = sort.key === field;
  const Icon = active ? sort.direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <TableHead className={(field === "studentName" ? "w-[24%] " : field === "documentLabel" ? "w-[23%] " : field === "status" ? "w-[19%] pr-8 text-right " : "w-[14%] ")} aria-sort={active ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
    <button type="button" className={"flex items-center gap-2 rounded py-4 font-semibold text-muted-foreground hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-primary " + (field === "status" ? "ml-auto" : "")} onClick={() => onSort(field)}>{title}<Icon className="h-3 w-3" aria-hidden="true" /></button>
  </TableHead>;
}
export function QueueStatusBadge({ status }: { status: QueueItem["status"] }) {
  return <span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap " +
    (status === "CANCELLED" ? "text-destructive bg-destructive/10" : status === "PENDING_PAYMENT" || status === "PROCESSING" ? "text-yellow-700 dark:text-gold bg-yellow-500/10" : "text-primary bg-primary/10")}>{queueStatusLabels[status]}</span>;
}
export function QueueTable({ items, selection, disabled, sort, onSort, onToggle, onTogglePage, onDetails }: {
  items: QueueItem[]; selection: Map<string, string>; disabled: boolean; sort: QueueSort;
  onSort: (field: QueueSort["key"]) => void; onToggle: (item: QueueItem) => void; onTogglePage: () => void; onDetails: (item: QueueItem) => void;
}) {
  return <Table className="table-fixed min-w-[1000px]">
    <TableHeader><TableRow className="border-b border-border/50 hover:bg-transparent">
      <TableHead className="pl-8 w-[6%]"><input type="checkbox" className="size-4 accent-primary" aria-label="Select this page" checked={items.length > 0 && items.every(item => selection.has(item.id))}
        disabled={disabled || !items.length} onChange={onTogglePage} /></TableHead>
      <SortableHeader title="Student" field="studentName" sort={sort} onSort={onSort} />
      <SortableHeader title="Document" field="documentLabel" sort={sort} onSort={onSort} />
      <SortableHeader title="Payment" field="paymentStatus" sort={sort} onSort={onSort} />
      <SortableHeader title="Last Updated" field="updatedAt" sort={sort} onSort={onSort} />
      <SortableHeader title="Status" field="status" sort={sort} onSort={onSort} />
    </TableRow></TableHeader>
    <TableBody>{items.length === 0 ? <TableRow><TableCell colSpan={6} className="h-48 text-center text-muted-foreground">No requests match this view.</TableCell></TableRow> : items.map(item => <TableRow key={item.id} className={"group border-b border-border/40 last:border-0 transition-colors hover:bg-primary/5 " + (selection.has(item.id) ? "bg-primary/10" : "")}>
      <TableCell className="pl-8 py-4"><input type="checkbox" className="size-4 accent-primary" aria-label={"Select request " + item.id} checked={selection.has(item.id)} disabled={disabled} onChange={() => onToggle(item)} /></TableCell>
      <TableCell className="py-4 whitespace-normal"><div className="flex items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary"><User aria-hidden="true" className="size-5" /></div><div className="min-w-0"><button type="button" aria-label={"View request " + item.id} className="text-left font-semibold underline-offset-4 hover:underline break-words" onClick={() => onDetails(item)} disabled={disabled}>{item.studentName || "Unknown Student"}</button><p className="text-xs text-muted-foreground break-words">{item.studentNumber}</p></div></div></TableCell>
      <TableCell className="py-4 whitespace-normal"><span className="font-medium">{item.documentLabel}</span><p className="mt-1 text-xs text-muted-foreground">{item.purpose.replace(/_/g, " ")}</p></TableCell>
      <TableCell className="py-4"><span className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize " + (item.paymentMethod === "online" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-500")}>{item.paymentMethod === "online" ? <CreditCard aria-hidden="true" className="size-3.5" /> : <Banknote aria-hidden="true" className="size-3.5" />}{item.paymentMethod}</span><p className="mt-1 text-xs text-muted-foreground whitespace-normal">{item.paymentStatus.replace(/_/g, " ")}</p></TableCell>
      <TableCell className="py-4"><span className="font-medium">{format(new Date(item.updatedAt), "MMM d, yyyy")}</span><p className="mt-1 text-xs text-muted-foreground">{format(new Date(item.updatedAt), "h:mm a")}</p></TableCell>
      <TableCell className="pr-8 py-4 text-right"><QueueStatusBadge status={item.status} />{!item.identityVerified && item.status !== "CANCELLED" && item.status !== "COMPLETED" && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 whitespace-normal">Identity review required</p>}</TableCell>
    </TableRow>)}</TableBody>
  </Table>;
}
