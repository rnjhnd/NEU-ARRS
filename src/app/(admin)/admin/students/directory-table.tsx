import { ArrowDown, ArrowUp, ArrowUpDown, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPHP } from "@/lib/money-format";
import type { DirectorySort, DirectoryStudent } from "@/lib/student-directory-model";

type SortProps = { sort: DirectorySort; onSort: (key: DirectorySort["key"]) => void };
function SortHeader({ label, column, sort, onSort, alignRight = false }: SortProps & { label: string; column: DirectorySort["key"]; alignRight?: boolean }) {
  const active = sort.key === column;
  const Icon = active ? sort.direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <TableHead scope="col" aria-sort={active ? sort.direction === "asc" ? "ascending" : "descending" : "none"} className={(column === "name" ? "pl-8 w-[35%] " : column === "email" ? "w-[30%] " : column === "requestCount" ? "w-[15%] " : "pr-8 w-[20%] ") + (alignRight ? "text-right" : "")}>
    <button type="button" className={`inline-flex items-center gap-2 rounded py-4 font-semibold text-muted-foreground hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-primary ${alignRight ? "ml-auto" : ""}`} onClick={() => onSort(column)}>
      {label}<Icon aria-hidden="true" className="size-3" />
    </button>
  </TableHead>;
}
export function DirectoryTable({ items, sort, onSort, hasStudents }: SortProps & { items: DirectoryStudent[]; hasStudents: boolean }) {
  return <Table className="table-fixed min-w-[1000px]">
    <caption className="sr-only">Student primary contact, all-time request counts, and verified settled collection values.</caption>
    <TableHeader><TableRow className="border-b border-border/50 hover:bg-transparent">
      <SortHeader label="Student" column="name" sort={sort} onSort={onSort} />
      <SortHeader label="Primary Email" column="email" sort={sort} onSort={onSort} />
      <SortHeader label="Requests" column="requestCount" sort={sort} onSort={onSort} alignRight />
      <SortHeader label="Verified Value" column="collectedCentavos" sort={sort} onSort={onSort} alignRight />
    </TableRow></TableHeader>
    <TableBody>{items.length ? items.map(student => <TableRow key={student.id} className="group border-b border-border/40 last:border-0 hover:bg-primary/5 transition-colors">
      <TableCell className="pl-8 py-4"><div className="flex items-center gap-4">
        <Avatar size="lg" className="border border-primary/20 bg-primary/10 text-primary shadow-sm group-hover:border-primary/40">{student.imageUrl && <AvatarImage src={student.imageUrl} alt="" referrerPolicy="no-referrer" />}<AvatarFallback className="bg-primary/10 text-primary"><User aria-hidden="true" className="size-5" /></AvatarFallback></Avatar>
        <span className="max-w-64 break-words whitespace-normal font-semibold">{student.name}</span>
      </div></TableCell>
      <TableCell className="py-4 break-words whitespace-normal text-muted-foreground">{student.email ?? "No primary email"}</TableCell>
      <TableCell className="text-right py-4 font-medium">{student.requestCount.toLocaleString("en-PH")}</TableCell>
      <TableCell className="text-right pr-8 py-4"><span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatPHP(student.collectedCentavos)}</span>
        {student.unverifiedCount > 0 && <p className="max-w-56 whitespace-normal text-xs text-amber-700 dark:text-amber-400">{student.unverifiedCount} amount(s) need verification; excluded.</p>}
      </TableCell>
    </TableRow>) : <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">{hasStudents ? "No students match your search." : "No students are currently registered."}</TableCell></TableRow>}</TableBody>
  </Table>;
}
