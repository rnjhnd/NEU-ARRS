import { LoaderCircle } from "lucide-react";

/** Exceptional cache/session recovery only; ordinary navigation keeps its page. */
export function PageLoading() {
  return (
    <div role="status" aria-label="Checking account access" aria-busy="true"
      className="flex min-h-48 items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
      <span>Checking account access…</span>
    </div>
  );
}
