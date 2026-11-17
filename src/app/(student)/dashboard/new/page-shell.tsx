import type { ReactNode } from "react";
import { LoadingRegion } from "@/components/workspace-banner";
import { Skeleton } from "@/components/ui/skeleton";

export function NewRequestShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl space-y-8">
    <header><h1 className="text-3xl font-bold">Request Document</h1><p className="text-muted-foreground">Select a document and a payment method to continue.</p></header>
    {children}
  </div>;
}

export function RequestFormSkeleton() {
  return <LoadingRegion label="Loading request form">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      <div className="lg:col-span-2 rounded-3xl border bg-card p-6 sm:p-8 space-y-8">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-6 w-40" />
        <div className="grid sm:grid-cols-2 gap-6">{[1, 2].map(i => <div key={i} className="space-y-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-11 w-full" /></div>)}</div>
        {[1, 2, 3].map(i => <div key={i} className="border-t pt-10 space-y-6"><Skeleton className="h-6 w-40" /><div className="grid sm:grid-cols-2 gap-4"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-28 w-full rounded-2xl" /></div></div>)}
      </div>
      <div className="rounded-3xl border bg-card p-6 space-y-6"><Skeleton className="h-7 w-40" /><Skeleton className="h-40 w-full" /><Skeleton className="h-12 w-full" /></div>
    </div>
  </LoadingRegion>;
}
