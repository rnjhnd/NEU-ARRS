import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function StudentDashboardLoading() {
  return (
    <div className="space-y-8 w-full animate-pulse">
      {/* Hero Banner Skeleton */}
      <div className="relative overflow-hidden rounded-3xl bg-muted/40 p-8 sm:p-10 border border-border/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-3">
            <Skeleton className="h-10 w-64 sm:w-80" />
            <Skeleton className="h-6 w-full sm:w-96" />
          </div>
          <Skeleton className="h-14 w-full sm:w-48 rounded-full" />
        </div>
      </div>

      {/* Quick Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-muted/20 rounded-2xl p-6 border border-border/50 flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        ))}
      </div>

      <Card className="shadow-lg border-primary/10 overflow-hidden bg-background/70 backdrop-blur-xl rounded-3xl pt-0 gap-0 pb-0">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 pb-6 px-8 pt-8">
          <Skeleton className="h-6 w-40 mb-2" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-b border-border/50 bg-transparent hover:bg-transparent">
                  <TableHead className="pl-8 w-[15%]"><Skeleton className="h-4 w-20" /></TableHead>
                  <TableHead className="w-[22%]"><Skeleton className="h-4 w-24" /></TableHead>
                  <TableHead className="w-[15%]"><Skeleton className="h-4 w-16" /></TableHead>
                  <TableHead className="w-[15%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableHead>
                  <TableHead className="w-[15%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-20" /></div></TableHead>
                  <TableHead className="pr-8 w-[18%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-24" /></div></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i} className="border-b border-border/50 last:border-0">
                    <TableCell className="pl-8 py-4">
                      <Skeleton className="h-6 w-20 rounded-md" />
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <div className="flex justify-end">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-16 ml-auto" />
                          <Skeleton className="h-3 w-12 ml-auto" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <div className="flex justify-end"><Skeleton className="h-5 w-20 rounded-full" /></div>
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
