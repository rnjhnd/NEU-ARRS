import type { ReactNode } from "react";
import { WorkspaceBanner, LoadingRegion } from "@/components/workspace-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";

export function SettingsShell({ children }: { children: ReactNode }) {
  return <div className="space-y-8 w-full">
    <WorkspaceBanner title="System Settings" description="Manage system configuration, role assignments, and global application parameters." />
      <Link href="/admin/notifications" className="inline-flex rounded-md border border-border px-4 py-2 font-medium">Notification recovery</Link>
    {children}
  </div>;
}

export function SettingsSkeleton() {
  return (
    <LoadingRegion label="Loading system settings">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-pulse">
        <div className="rounded-3xl bg-card border border-border shadow-sm overflow-hidden xl:col-span-1 h-fit">
          <div className="p-6 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 bg-muted/50 rounded-xl border border-border flex items-start gap-4">
                <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-48 mb-4" />
                  <Skeleton className="h-8 w-full rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-card border border-border shadow-sm overflow-hidden xl:col-span-2 h-fit">
          <div className="p-6 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <Skeleton className="h-10 w-full sm:w-64 rounded-full" />
              <Skeleton className="h-10 w-full sm:w-[160px] rounded-full" />
            </div>
          </div>
          <div className="p-0 w-full overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead className="pl-6 w-[60%] h-12"><Skeleton className="h-4 w-12" /></TableHead>
                  <TableHead className="w-[40%] h-12"><Skeleton className="h-4 w-12" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <TableRow key={i} className="border-b border-border hover:bg-transparent">
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                        <div className="flex flex-col space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-9 w-[150px] rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
