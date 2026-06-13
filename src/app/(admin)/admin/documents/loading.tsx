import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Loading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Hero Banner Skeleton */}
      <div className="relative overflow-hidden rounded-3xl bg-muted/40 p-8 sm:p-10 border border-border/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-3">
            <Skeleton className="h-10 w-64 sm:w-80" />
            <Skeleton className="h-6 w-full sm:w-96" />
          </div>
          <Skeleton className="h-12 w-full sm:w-48 rounded-full" />
        </div>
      </div>

      <Card className="shadow-sm border-border !pb-0">
        <CardHeader className="border-b pb-6 px-8 pt-8 bg-gradient-to-r from-primary/5 to-transparent">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-b border-border/50 bg-transparent hover:bg-transparent">
                  <TableHead className="pl-8 w-[25%]"><Skeleton className="h-4 w-24" /></TableHead>
                  <TableHead className="w-[35%]"><Skeleton className="h-4 w-32" /></TableHead>
                  <TableHead className="w-[15%]"><Skeleton className="h-4 w-16" /></TableHead>
                  <TableHead className="w-[15%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-12" /></div></TableHead>
                  <TableHead className="pr-8 w-[10%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4].map((i) => (
                  <TableRow key={i} className="border-b border-border/40 last:border-0">
                    <TableCell className="pl-8 py-4">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-32" />
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-4 w-64" />
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <div className="flex justify-end"><Skeleton className="h-5 w-16" /></div>
                    </TableCell>
                    <TableCell className="text-right pr-8 py-4">
                      <div className="flex justify-end gap-2"><Skeleton className="h-8 w-8 rounded-full" /></div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
