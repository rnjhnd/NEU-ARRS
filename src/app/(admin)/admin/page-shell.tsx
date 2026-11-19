import type { ReactNode } from "react";
import { WorkspaceBanner, LoadingRegion } from "@/components/workspace-banner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QUEUE_PAGE_SIZE, queueStatusLabels } from "@/lib/admin-queue-model";

export function CommandCenterShell({ children }: { children: ReactNode }) {
  return <div className="space-y-8 w-full">
    <WorkspaceBanner title="Registrar Command Center" description="Manage and process incoming student document requests in real-time." />
    {children}
  </div>;
}

export function AdminQueueSkeleton() {
  return (
    <LoadingRegion label="Loading registrar command center">
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
            {Array.from({ length: Object.keys(queueStatusLabels).length + 1 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-10 w-full sm:w-80 rounded-full" />
        </div>

        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0 gap-0 !pb-0">
          <CardHeader className="flex flex-col gap-5 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent !py-6 px-6 sm:px-8">
            <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="min-w-0 max-w-3xl">
              <Skeleton className="h-8 w-40 mb-2" />
              <Skeleton className="mt-1 h-5 w-full max-w-2xl" />
            </div>
            <div className="flex flex-wrap gap-3 xl:justify-end">
              <Skeleton className="h-10 w-40 rounded-full" />
              <Skeleton className="h-10 w-40 rounded-full" />
            </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <Table className="table-fixed min-w-[1000px]">
                <TableHeader>
                  <TableRow className="border-b border-border/50 bg-transparent hover:bg-transparent">
                    <TableHead className="w-[6%] pl-8"><Skeleton className="h-4 w-4 rounded" /></TableHead>
                    <TableHead className="w-[24%]"><Skeleton className="h-4 w-16" /></TableHead>
                    <TableHead className="w-[23%]"><Skeleton className="h-4 w-24" /></TableHead>
                    <TableHead className="w-[14%]"><Skeleton className="h-4 w-16" /></TableHead>
                    <TableHead className="w-[14%]"><Skeleton className="h-4 w-20" /></TableHead>
                    <TableHead className="pr-8 w-[19%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: QUEUE_PAGE_SIZE }, (_, i) => (
                    <TableRow key={i} className="border-b border-border/40 last:border-0">
                      <TableCell className="pl-8 py-4">
                        <Skeleton className="h-4 w-4 rounded" />
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-10 shrink-0 rounded-full" />
                          <div className="min-w-0 space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-24" /></div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="space-y-2"><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="h-3 w-24" /></div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8 py-4">
                        <div className="space-y-2"><div className="flex justify-end"><Skeleton className="h-6 w-24 rounded-full" /></div><div className="flex justify-end"><Skeleton className="h-3 w-36" /></div></div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <div className="flex flex-col items-center justify-between gap-4 border-t border-border/50 bg-muted/10 px-6 py-4 sm:flex-row sm:px-8">
            <Skeleton className="h-5 w-48" />
            <div className="flex items-center gap-2"><Skeleton className="h-9 w-24 rounded-full" /><Skeleton className="h-4 w-20" /><Skeleton className="h-9 w-24 rounded-full" /></div>
          </div>
        </Card>
      </div>
    </LoadingRegion>
  );
}
