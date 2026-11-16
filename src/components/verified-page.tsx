import "server-only";
import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { requirePageAccess } from "@/lib/page-access";
import type { AppRole } from "@/lib/role-policy";
import { SessionPage } from "./session-guard";

/** Use the page request's authorization result instead of a second client RPC. */
export function withVerifiedPage<Args extends unknown[]>(
  renderPage: (...args: Args) => Promise<ReactNode>,
  roles: readonly AppRole[],
) {
  return async function VerifiedPage(...args: Args) {
    const access = await requirePageAccess(roles);
    return <SessionPage access={access} snapshotId={randomUUID()}>{await renderPage(...args)}</SessionPage>;
  };
}
