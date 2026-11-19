"use client";

import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Feedback belongs to the clicked link while Next keeps the current page. */
export function NavigationPending({ className, enabled = true }: { className?: string; enabled?: boolean }) {
  const { pending } = useLinkStatus();
  const visible = enabled && pending;
  return <span role="status" aria-label={visible ? "Loading destination" : undefined} aria-hidden={!visible}
    className={cn("inline-flex h-4 w-4 shrink-0 transition-opacity motion-reduce:transition-none", visible ? "opacity-100 delay-150" : "opacity-0 delay-0", className)}>
    <LoaderCircle aria-hidden="true" className="h-full w-full motion-safe:animate-spin" />
  </span>;
}
