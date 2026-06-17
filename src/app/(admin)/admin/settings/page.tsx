import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { SettingsData } from "./settings-data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Admin Settings" };

function SettingsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 animate-pulse">
      <Card className="md:col-span-1 shadow-sm border-border">
        <CardHeader className="border-b bg-muted/5 pb-4 pt-6 px-6">
          <Skeleton className="h-6 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-6">
            <Skeleton className="h-10 w-full mb-4" />
            <div className="space-y-4 mt-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 border-b border-border/50 pb-4 last:border-0 last:pb-0">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 shadow-sm border-border rounded-3xl overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent p-6">
          <div>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-full sm:w-80 rounded-full" />
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex gap-2 mb-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-32" />
            ))}
          </div>
          <Skeleton className="h-[200px] w-full mb-6" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    </div>
  );
}

export default async function SettingsPage() {
  await requireAdmin();

  return (
    <div className="space-y-8 w-full">
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-8 sm:p-10 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 rounded-full bg-primary/20 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
              System Settings
            </h1>
            <p className="text-white/90 text-lg font-medium max-w-xl">
              Manage system configuration, role assignments, and global application parameters.
            </p>
          </div>
        </div>
      </div>

      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsData />
      </Suspense>
    </div>
  );
}
