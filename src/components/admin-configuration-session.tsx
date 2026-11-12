"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import useSWR from "swr";
import { ConfigurationRefreshError } from "@/lib/configuration-fetcher";

const Session = createContext<{ active: { current: boolean }; deny: () => void } | null>(null);
export function AdminConfigurationSession({ actorId, children }: { actorId: string; children: ReactNode }) {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <p role="status">Checking administrator access…</p>;
  if (user?.id !== actorId || user.publicMetadata.role !== "admin") return <p role="alert">Your administrator account or role changed. Reload this page.</p>;
  return <VerifiedSession key={actorId}>{children}</VerifiedSession>;
}
function VerifiedSession({ children }: { children: ReactNode }) {
  const [denied, setDenied] = useState(false); const active = useRef(false);
  useEffect(() => { active.current = !denied; return () => { active.current = false; }; }, [denied]);
  const deny = useCallback(() => setDenied(true), []);
  const value = useMemo(() => ({ active, deny }), [deny]);
  if (denied) return <p role="alert">Administrator access could not be verified. Reload this page.</p>;
  return <Session.Provider value={value}>{children}</Session.Provider>;
}
export function useConfigurationSession() { const session = useContext(Session); if (!session) throw new Error("Administrator session boundary missing."); return session; }
export function useConfigurationRead<T extends { actorId: string }>(url: string, actorId: string, initialData: T | undefined, fetcher: (key: readonly [string, string]) => Promise<T>) {
  const session = useConfigurationSession();
  const matching = initialData?.actorId === actorId ? initialData : undefined;
  const state = useSWR<T, Error>([url, actorId] as const, fetcher, { fallbackData: matching, revalidateOnMount: !matching, refreshInterval: 0,
    revalidateOnFocus: true, revalidateOnReconnect: true, focusThrottleInterval: 60_000, dedupingInterval: 60_000, shouldRetryOnError: false });
  const denied = state.error instanceof ConfigurationRefreshError && [401, 403, 404, 409].includes(state.error.status);
  useEffect(() => { if (denied) session.deny(); }, [denied, session]);
  async function refresh() { try { return await state.mutate(); } catch { return undefined; } }
  return { ...state, refresh, session, denied, blocked: !state.data || Boolean(state.error) || state.isValidating || denied };
}
