import { LoaderCircle } from "lucide-react";
import { LogoIcon } from "@/components/logo-icon";

/** Initial account/portal transitions have no assumed dashboard or staff layout. */
export function WorkspaceLoading({ signingOut = false }: { signingOut?: boolean }) {
  return (
    <main role="status" aria-label={signingOut ? "Signing out" : "Loading workspace"} aria-busy="true"
      className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="flex flex-col items-center gap-5 py-12">
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="rounded-xl bg-primary/10 p-2 text-primary"><LogoIcon /></div>
          <span className="text-xl font-bold tracking-tight">NEU <span className="font-normal text-muted-foreground">ARRS</span></span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
          <span>{signingOut ? "Signing out…" : "Opening your workspace…"}</span>
        </div>
      </div>
    </main>
  );
}

/** Route verification occupies only the page slot inside its existing layout. */
export function PageLoading() {
  return (
    <div role="status" aria-label="Loading page" aria-busy="true"
      className="flex min-h-48 items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
      <span>Loading page…</span>
    </div>
  );
}
