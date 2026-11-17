import type { ReactNode } from "react";
import Link from "next/link";
import { LoadingRegion } from "@/components/workspace-banner";
import { Skeleton } from "@/components/ui/skeleton";

export function MovementsShell({ children }: { children: ReactNode }) {
  return <main className="space-y-6">
    <header className="space-y-2"><h1 className="text-3xl font-bold">Money Movements</h1><Link href="/admin/finance" className="underline">Settled Request Values — submitted-date report</Link></header>
    {children}
  </main>;
}

export function MovementsSkeleton() {
  return <LoadingRegion label="Loading money movements">
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3"><Skeleton className="h-10 w-48" /><Skeleton className="h-10 w-36" /><Skeleton className="h-10 w-32" /></div>
      <div className="grid sm:grid-cols-3 gap-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
      <div className="rounded-xl border p-6 space-y-5"><Skeleton className="h-7 w-48" />{[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
    </div>
  </LoadingRegion>;
}
