import type { ReactNode } from "react";
import { WorkspaceBanner, LoadingRegion } from "@/components/workspace-banner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function DocumentsShell({ children }: { children: ReactNode }) {
  return <div className="space-y-8 w-full">
    <WorkspaceBanner title="Document Management" description="Configure dynamic pricing and availability for official university documents." />
    {children}
  </div>;
}

export function DocumentsSkeleton() {
  return (
    <LoadingRegion label="Loading document management">
      <div className="space-y-8 w-full animate-pulse">
        {/* Metrics Row Skeleton */}
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

        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0 gap-0 !pb-0">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-8">
            <div>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <Skeleton className="h-10 w-full sm:w-64 rounded-full" />
              <Skeleton className="h-10 w-full sm:w-28 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow className="border-b border-border/50 bg-transparent hover:bg-transparent">
                    <TableHead className="pl-8 w-[25%]"><Skeleton className="h-4 w-24" /></TableHead>
                    <TableHead className="w-[35%]"><Skeleton className="h-4 w-32" /></TableHead>
                    <TableHead className="w-[15%]"><Skeleton className="h-4 w-16" /></TableHead>
                    <TableHead className="w-[15%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableHead>
                    <TableHead className="pr-8 w-[10%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <TableRow key={i} className="border-b border-border/40 last:border-0">
                      <TableCell className="pl-8 py-4">
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell className="py-4">
                        <Skeleton className="h-4 w-full max-w-[250px]" />
                      </TableCell>
                      <TableCell className="py-4">
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </TableCell>
                      <TableCell className="text-right py-4">
                        <div className="flex justify-end"><Skeleton className="h-5 w-16" /></div>
                      </TableCell>
                      <TableCell className="text-right pr-8 py-4">
                        <div className="flex justify-end gap-2">
                          <Skeleton className="h-8 w-8 rounded-md" />
                          <Skeleton className="h-8 w-8 rounded-md" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </LoadingRegion>
  );
}
