"use client";

import { format } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { queueStatusLabels, type QueueItem, type QueueSort } from "@/lib/admin-queue-model";

function SortableHeader({ title, field, sort, onSort }: { title: string; field: QueueSort["key"]; sort: QueueSort; onSort: (field: QueueSort["key"]) => void }) {
  const active = sort.key === field;
  const Icon = active ? sort.direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <TableHead aria-sort={active ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
    <button type="button" className="flex items-center gap-2 py-3 font-semibold" onClick={() => onSort(field)}>{title}<Icon className="h-3 w-3" aria-hidden="true" /></button>
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
  return <Table className="min-w-[1000px]">
    <TableHeader><TableRow>
      <TableHead><input type="checkbox" aria-label="Select this page" checked={items.length > 0 && items.every(item => selection.has(item.id))}
        disabled={disabled || !items.length} onChange={onTogglePage} /></TableHead>
      <SortableHeader title="Student" field="studentName" sort={sort} onSort={onSort} />
      <SortableHeader title="Document" field="documentLabel" sort={sort} onSort={onSort} />
      <SortableHeader title="Payment" field="paymentStatus" sort={sort} onSort={onSort} />
      <SortableHeader title="Last Updated" field="updatedAt" sort={sort} onSort={onSort} />
      <SortableHeader title="Status" field="status" sort={sort} onSort={onSort} />
    </TableRow></TableHeader>
    <TableBody>{items.length === 0 ? <TableRow><TableCell colSpan={6} className="h-40 text-center">No requests match this view.</TableCell></TableRow> : items.map(item => <TableRow key={item.id} className={selection.has(item.id) ? "bg-primary/10" : ""}>
      <TableCell><input type="checkbox" aria-label={"Select request " + item.id} checked={selection.has(item.id)} disabled={disabled} onChange={() => onToggle(item)} /></TableCell>
      <TableCell><button type="button" aria-label={"View request " + item.id} className="text-left font-semibold underline-offset-4 hover:underline" onClick={() => onDetails(item)} disabled={disabled}>{item.studentName || "Unknown Student"}</button><p className="text-xs text-muted-foreground">{item.studentNumber}</p></TableCell>
      <TableCell>{item.documentLabel}<p className="text-xs text-muted-foreground">{item.purpose.replace(/_/g, " ")}</p></TableCell>
      <TableCell><span className="capitalize">{item.paymentMethod}</span><p className="text-xs text-muted-foreground">{item.paymentStatus.replace(/_/g, " ")}</p></TableCell>
      <TableCell>{format(new Date(item.updatedAt), "MMM d, yyyy")}<p className="text-xs text-muted-foreground">{format(new Date(item.updatedAt), "h:mm a")}</p></TableCell>
      <TableCell><QueueStatusBadge status={item.status} />{!item.identityVerified && item.status !== "CANCELLED" && item.status !== "COMPLETED" && <p className="text-xs text-amber-700 dark:text-amber-400">Identity review required</p>}</TableCell>
    </TableRow>)}</TableBody>
  </Table>;
}
