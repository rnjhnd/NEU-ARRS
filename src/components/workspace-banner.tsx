import type { ReactNode } from "react";

/** Static presentation only: callers must not put private data in route fallbacks. */
export function WorkspaceBanner({ title, description, children }: { title: ReactNode; description: string; children?: ReactNode }) {
  return <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-8 sm:p-10 text-primary-foreground shadow-xl">
    <div aria-hidden="true" className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
    <div aria-hidden="true" className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 rounded-full bg-black/10 blur-2xl" />
    <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm text-white">{title}</h1>
        <p className="text-white/80 text-lg font-medium max-w-xl">{description}</p>
      </div>
      {children}
    </div>
  </header>;
}

export function LoadingRegion({ label, children }: { label: string; children: ReactNode }) {
  return <div role="status" aria-label={label} aria-busy="true" data-loading-region>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true">{children}</div>
  </div>;
}
