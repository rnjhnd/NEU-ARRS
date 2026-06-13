import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminQueueLoading() {
  return (
    <div className="space-y-8 w-full animate-pulse">
      {/* Hero Banner Skeleton */}
      <div className="relative overflow-hidden rounded-3xl bg-muted/40 p-8 sm:p-10 border border-border/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-3">
            <Skeleton className="h-10 w-64 sm:w-80" />
            <Skeleton className="h-6 w-full sm:w-96" />
          </div>
          <Skeleton className="h-12 w-full sm:w-64 rounded-full" />
        </div>
      </div>

      {/* At-A-Glance Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="shadow-sm border-border bg-card">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-12" />
              </div>
              <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-full" />
        ))}
      </div>

      <Card className="shadow-sm border-border overflow-hidden !pb-0">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent pb-6 px-8 pt-8">
          <div>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-b border-border/50 bg-transparent hover:bg-transparent">
                  <TableHead className="w-[50px] pl-8"><Skeleton className="h-4 w-4 rounded" /></TableHead>
                  <TableHead className="w-[20%]"><Skeleton className="h-4 w-16" /></TableHead>
                  <TableHead className="w-[25%]"><Skeleton className="h-4 w-24" /></TableHead>
                  <TableHead className="w-[15%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableHead>
                  <TableHead className="w-[15%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-20" /></div></TableHead>
                  <TableHead className="pr-8 w-[20%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <TableRow key={i} className="border-b border-border/40 last:border-0">
                    <TableCell className="pl-8 py-4">
                      <Skeleton className="h-4 w-4 rounded" />
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-4 w-48" />
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <div className="flex justify-end"><Skeleton className="h-5 w-20 rounded-full" /></div>
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <div className="flex justify-end">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-20 ml-auto" />
                          <Skeleton className="h-3 w-16 ml-auto" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-8 py-4">
                      <div className="flex justify-end"><Skeleton className="h-6 w-24 rounded-full" /></div>
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
