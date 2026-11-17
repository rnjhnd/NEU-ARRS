import type { ReactNode } from "react";
import { LoadingRegion } from "@/components/workspace-banner";
import { Skeleton } from "@/components/ui/skeleton";

export function NotificationsShell({ children }: { children: ReactNode }) {
  return <div className="space-y-6"><header className="space-y-6">
    <h1 className="text-3xl font-bold">Notification recovery</h1>
    <p>Pending and review items, oldest first (50 per page). Accepted emails are recorded separately; provider acceptance does not confirm inbox delivery.</p>
  </header>{children}</div>;
}

export function NotificationsSkeleton() {
  return <LoadingRegion label="Loading notification recovery"><div className="space-y-4">
    <Skeleton className="h-10 w-48" />
    {[1, 2, 3].map(i => <div key={i} className="rounded-xl border p-5 space-y-4"><Skeleton className="h-5 w-64 max-w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-10 w-full" /></div>)}
  </div></LoadingRegion>;
}
