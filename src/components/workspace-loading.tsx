import { LogoIcon } from "@/components/logo-icon";
import { Skeleton } from "@/components/ui/skeleton";

/** Public placeholders only: this renders before account access is confirmed. */
export function WorkspaceLoading() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
        <header className="flex h-16 items-center justify-between rounded-2xl border border-primary/20 bg-card px-4 shadow-sm sm:px-6">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="rounded-xl bg-primary/10 p-2 text-primary">
              <LogoIcon className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              NEU <span className="font-normal text-muted-foreground">ARRS</span>
            </span>
          </div>
          <Skeleton aria-hidden="true" className="h-9 w-9 rounded-full motion-reduce:animate-none" />
        </header>

        <main role="status" aria-label="Loading workspace" aria-busy="true" className="space-y-8 py-10">
          <span className="sr-only">Loading your workspace…</span>
          <div aria-hidden="true" className="space-y-8">
            <div className="space-y-3">
              <Skeleton className="h-8 w-48 motion-reduce:animate-none" />
              <Skeleton className="h-4 w-full max-w-sm motion-reduce:animate-none" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[0, 1, 2].map(card => (
                <div key={card} className="space-y-4 rounded-2xl border bg-card p-6">
                  <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
                  <Skeleton className="h-8 w-16 motion-reduce:animate-none" />
                </div>
              ))}
            </div>
            <div className="rounded-2xl border bg-card p-4 sm:p-6">
              <Skeleton className="mb-6 h-6 w-36 motion-reduce:animate-none" />
              <div className="divide-y">
                {[0, 1, 2, 3].map(row => (
                  <div key={row} className="flex items-center gap-4 py-5">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-xl motion-reduce:animate-none" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4 max-w-xs motion-reduce:animate-none" />
                      <Skeleton className="h-3 w-1/2 max-w-48 motion-reduce:animate-none" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full motion-reduce:animate-none" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
