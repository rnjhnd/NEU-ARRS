import { requireEmployeeOrAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { AdminQueueData } from "./admin-queue-data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function AdminQueueSkeleton() {
  return (
    <div className="space-y-8 w-full animate-pulse">
      {/* At-A-Glance Stats Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
            <CardContent className="p-6 flex flex-1 items-center gap-5">
              <Skeleton className="w-14 h-14 rounded-2xl shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-muted/50 p-1.5 rounded-full overflow-x-auto no-scrollbar max-w-full shadow-sm border border-border/50">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-10 w-full sm:w-80 rounded-full" />
      </div>

      <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0 gap-0 !pb-0">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent !py-6 px-8">
          <div>
            <Skeleton className="h-8 w-40 mb-2" />
            <div className="flex items-center gap-4 mt-1">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-9 w-32 rounded-full" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[1000px]">
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

export default async function AdminPage() {
  // Ensure the user is an admin before rendering or fetching data
  await requireEmployeeOrAdmin();

  return (
    <div className="space-y-8 w-full">
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-8 sm:p-10 text-primary-foreground shadow-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 rounded-full bg-black/10 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm text-white">
              Registrar Command Center
            </h1>
            <p className="text-white/80 text-lg font-medium max-w-xl">
              Manage and process incoming student document requests in real-time.
            </p>
          </div>
        </div>
      </div>
      
      <Suspense fallback={<AdminQueueSkeleton />}>
        <AdminQueueData />
      </Suspense>
    </div>
  );
}
