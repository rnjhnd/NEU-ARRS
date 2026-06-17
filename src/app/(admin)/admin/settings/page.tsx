import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { SettingsData } from "./settings-data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Admin Settings" };

function SettingsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
      <div className="rounded-3xl bg-card border border-border shadow-sm overflow-hidden md:col-span-1 h-fit">
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
          <Skeleton className="h-6 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 bg-muted/50 rounded-xl border border-border">
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-3 w-48 mb-4" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
          <div className="p-4 bg-muted/50 rounded-xl border border-border">
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-3 w-48 mb-4" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-card border border-border shadow-sm overflow-hidden md:col-span-2">
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-full sm:w-80 rounded-full" />
        </div>
        <div className="p-0">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="pl-6 w-[40%] h-12"><Skeleton className="h-4 w-16" /></TableHead>
                <TableHead className="w-[30%] h-12"><Skeleton className="h-4 w-24" /></TableHead>
                <TableHead className="text-right pr-6 w-[30%] h-12"><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i} className="border-b border-border">
                  <TableCell className="pl-6 py-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </TableCell>
                  <TableCell className="text-right pr-6 py-4">
                    <div className="flex justify-end">
                      <Skeleton className="h-8 w-24 rounded-md" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
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
