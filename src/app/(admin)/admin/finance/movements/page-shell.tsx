import type { ReactNode } from "react";
import Link from "next/link";
import { LoadingRegion, WorkspaceBanner } from "@/components/workspace-banner";
import { Skeleton } from "@/components/ui/skeleton";

export function MovementsShell({ children }: { children: ReactNode }) {
  return <div className="space-y-8 w-full">
    <WorkspaceBanner title="Money Movements" description="Track verified collections and confirmed refunds by transaction date."><Link href="/admin/finance" className="rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20">Settled Request Values — submitted-date report</Link></WorkspaceBanner>
    {children}
  </div>;
}

export function MovementsSkeleton() {
  return <LoadingRegion label="Loading money movements">
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3"><Skeleton className="h-10 w-48" /><Skeleton className="h-10 w-36" /><Skeleton className="h-10 w-32" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">{[1, 2, 3].map(i => <div key={i} className="flex items-center gap-5 rounded-3xl border bg-card px-6 py-10"><Skeleton className="size-14 shrink-0 rounded-2xl" /><div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-28" /></div></div>)}</div>
      <div className="rounded-3xl border bg-card p-6 space-y-5"><Skeleton className="h-7 w-48" />{[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
    </div>
  </LoadingRegion>;
}
