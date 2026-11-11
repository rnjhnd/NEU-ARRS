import { ArrowDown, ArrowUp, ArrowUpDown, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPHP } from "@/lib/money-format";
import type { DirectorySort, DirectoryStudent } from "@/lib/student-directory-model";

type SortProps = { sort: DirectorySort; onSort: (key: DirectorySort["key"]) => void };
function SortHeader({ label, column, sort, onSort, alignRight = false }: SortProps & { label: string; column: DirectorySort["key"]; alignRight?: boolean }) {
  const active = sort.key === column;
  const Icon = active ? sort.direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <TableHead scope="col" aria-sort={active ? sort.direction === "asc" ? "ascending" : "descending" : "none"} className={alignRight ? "text-right" : ""}>
    <button type="button" className={`inline-flex items-center gap-2 rounded px-2 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-primary ${alignRight ? "ml-auto" : ""}`} onClick={() => onSort(column)}>
      {label}<Icon aria-hidden="true" className="size-3" />
    </button>
  </TableHead>;
}
export function DirectoryTable({ items, sort, onSort, hasStudents }: SortProps & { items: DirectoryStudent[]; hasStudents: boolean }) {
  return <Table className="min-w-[760px]">
    <caption className="sr-only">Student primary contact, all-time request counts, and verified settled collection values.</caption>
    <TableHeader><TableRow>
      <SortHeader label="Student" column="name" sort={sort} onSort={onSort} />
      <SortHeader label="Primary Email" column="email" sort={sort} onSort={onSort} />
      <SortHeader label="Requests" column="requestCount" sort={sort} onSort={onSort} alignRight />
      <SortHeader label="Verified Value" column="collectedCentavos" sort={sort} onSort={onSort} alignRight />
    </TableRow></TableHeader>
    <TableBody>{items.length ? items.map(student => <TableRow key={student.id}>
      <TableCell className="py-4"><div className="flex items-center gap-3">
        <Avatar size="lg">{student.imageUrl && <AvatarImage src={student.imageUrl} alt="" referrerPolicy="no-referrer" />}<AvatarFallback><User aria-hidden="true" className="size-5" /></AvatarFallback></Avatar>
        <span className="max-w-64 break-words whitespace-normal font-semibold">{student.name}</span>
      </div></TableCell>
      <TableCell className="max-w-72 break-words whitespace-normal text-muted-foreground">{student.email ?? "No primary email"}</TableCell>
      <TableCell className="text-right">{student.requestCount.toLocaleString("en-PH")}</TableCell>
      <TableCell className="text-right"><span className="font-semibold">{formatPHP(student.collectedCentavos)}</span>
        {student.unverifiedCount > 0 && <p className="max-w-56 whitespace-normal text-xs text-amber-700 dark:text-amber-400">{student.unverifiedCount} amount(s) need verification; excluded.</p>}
      </TableCell>
    </TableRow>) : <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">{hasStudents ? "No students match your search." : "No students are currently registered."}</TableCell></TableRow>}</TableBody>
  </Table>;
}
