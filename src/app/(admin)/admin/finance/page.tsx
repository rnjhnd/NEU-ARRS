import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { FinanceData } from "./finance-data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function FinanceSkeleton() {
  return (
    <div className="space-y-8 mt-8 animate-pulse">
      {/* KPI Cards Skeleton */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <Skeleton className="h-4 w-28 mb-3" />
                <Skeleton className="h-7 w-32" />
              </div>
              <Skeleton className="w-14 h-14 rounded-2xl shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-8">
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="px-8 pb-8 pt-6">
            <Skeleton className="h-[350px] w-full" />
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-8">
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="px-8 pb-8 pt-6">
            <Skeleton className="h-[350px] w-full rounded-full" />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-8">
            <Skeleton className="h-6 w-56 mb-2" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="px-8 pb-8 pt-6">
            <Skeleton className="h-[350px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default async function FinancePage() {
  await requireAdmin();

  return (
    <div className="space-y-8 w-full">
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-8 sm:p-10 text-primary-foreground shadow-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 rounded-full bg-black/10 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm text-white">
              Financial Analytics
            </h1>
            <p className="text-white/80 text-lg font-medium max-w-xl">
              Monitor revenue streams, payment methods, and historical financial trends.
            </p>
          </div>
        </div>
      </div>
      
      <Suspense fallback={<FinanceSkeleton />}>
        <FinanceData />
      </Suspense>
    </div>
  );
}
