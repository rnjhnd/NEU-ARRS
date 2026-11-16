"use client";

import { createContext, useContext } from "react";
import type { SessionActor } from "@/lib/page-access-model";

type AccessSnapshot = { sessionKey: string; actor: SessionActor; recheck: () => void };
export const VerifiedAccess = createContext<AccessSnapshot | null>(null);
export const PageSnapshot = createContext<string | undefined>(undefined);
export function usePageSnapshot() { return useContext(PageSnapshot); }

// Keep profile/navigation consumers independent of the monitoring implementation.
export function useVerifiedActor() {
  return useContext(VerifiedAccess)?.actor;
}
