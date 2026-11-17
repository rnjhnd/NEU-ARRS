import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceBanner, LoadingRegion } from "@/components/workspace-banner";
import { NewRequestButton } from "./new-request-button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const actionClass = "bg-white/20 hover:bg-white/30 text-white border-none shadow-sm backdrop-blur-md transition-transform hover:scale-105 rounded-full font-bold px-8";
export function DashboardShell({ children, firstName, isMaintenanceMode }: { children: ReactNode; firstName?: string; isMaintenanceMode?: boolean }) {
  return <div className="space-y-8 w-full">
    <WorkspaceBanner title={<>Welcome back, {firstName === undefined ? <Skeleton className="inline-block h-9 w-36 align-middle bg-white/20" /> : firstName}!</>} description="Track your academic document requests and initiate new ones instantly.">
      {isMaintenanceMode === undefined
        ? <Button disabled size="lg" className={actionClass}><Plus aria-hidden="true" className="w-5 h-5 mr-2" />New Request</Button>
        : <NewRequestButton isMaintenanceMode={isMaintenanceMode} className={actionClass}><Plus aria-hidden="true" className="w-5 h-5 mr-2" />New Request</NewRequestButton>}
    </WorkspaceBanner>
    {children}
  </div>;
}

export function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading document requests">
      <div className="space-y-8 w-full animate-pulse">
        {/* Quick Stats Skeleton */}
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
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-8">
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow className="border-b border-border/50 bg-transparent hover:bg-transparent">
                    <TableHead className="pl-8 w-[15%]"><Skeleton className="h-4 w-20" /></TableHead>
                    <TableHead className="w-[22%]"><Skeleton className="h-4 w-24" /></TableHead>
                    <TableHead className="w-[15%]"><Skeleton className="h-4 w-16" /></TableHead>
                    <TableHead className="w-[15%]"><Skeleton className="h-4 w-16" /></TableHead>
                    <TableHead className="w-[15%]"><Skeleton className="h-4 w-20" /></TableHead>
                    <TableHead className="pr-8 w-[15%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-24" /></div></TableHead>
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
                      <TableCell className="py-4">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-3 w-20" />
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
    </LoadingRegion>
  );
}
