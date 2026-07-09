import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { getSystemSetting } from "@/app/actions/admin.actions";
import { NewRequestButton } from "./new-request-button";
import { DashboardData } from "./dashboard-data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function DashboardSkeleton() {
  return (
    <div className="space-y-8 w-full animate-pulse">
      {/* Quick Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="shadow-sm border border-border overflow-hidden bg-card rounded-3xl p-6 flex items-center gap-5">
            <Skeleton className="w-[56px] h-[56px] rounded-2xl shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        ))}
      </div>

      <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0 gap-0 !pb-0">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-8">
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

export default async function StudentDashboardPage() {
  const { userId } = await auth();
  const user = await currentUser();
  const maintenanceSetting = await getSystemSetting("MAINTENANCE_MODE");
  const isMaintenanceMode = maintenanceSetting?.value === "true";

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="space-y-8 w-full">
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-8 sm:p-10 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 rounded-full bg-emerald-400/20 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
              Welcome back, {user?.firstName || "Student"}!
            </h1>
            <p className="text-emerald-100/90 text-lg font-medium max-w-xl">
              Track your academic document requests and initiate new ones instantly.
            </p>
          </div>
          <NewRequestButton 
            isMaintenanceMode={isMaintenanceMode}
            className="bg-white/20 hover:bg-white/30 text-white border-none shadow-sm backdrop-blur-md transition-transform hover:scale-105 rounded-full font-bold px-8"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Request
          </NewRequestButton>
        </div>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData userId={userId} />
      </Suspense>
    </div>
  );
}
