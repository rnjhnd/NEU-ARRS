"use client";

import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Feedback belongs to the clicked link while Next keeps the current page. */
export function NavigationPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return <span role="status" aria-label={pending ? "Loading destination" : undefined} aria-hidden={!pending}
    className={cn("inline-flex h-4 w-4 shrink-0 transition-opacity motion-reduce:transition-none", pending ? "opacity-100 delay-150" : "opacity-0 delay-0", className)}>
    <LoaderCircle aria-hidden="true" className="h-full w-full motion-safe:animate-spin" />
  </span>;
}
