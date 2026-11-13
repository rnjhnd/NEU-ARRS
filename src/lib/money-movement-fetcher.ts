import { movementDatasetSchema, movementQuerySchema, movementURL, MOVEMENT_BYTES } from "./money-movement-model";
export class MovementRefreshError extends Error {
  constructor(readonly status: number) { super(status === 413 ? "Too many dated movements. Choose a shorter period." : "Money movements could not be refreshed."); }
}
export async function fetchMoneyMovements([url, actorId]: readonly [string, string]) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (response.redirected) throw new MovementRefreshError(401);
  if (!response.ok) throw new MovementRefreshError(response.status);
  const body = await response.text();
  if (new TextEncoder().encode(body).length > MOVEMENT_BYTES) throw new MovementRefreshError(502);
  let raw: unknown; try { raw = JSON.parse(body); } catch { throw new MovementRefreshError(502); }
  const parsed = movementDatasetSchema.safeParse(raw);
  if (!parsed.success) throw new MovementRefreshError(502);
  if (parsed.data.actorId !== actorId) throw new MovementRefreshError(403);
  const params = new URL(url, "https://finance.invalid").searchParams;
  const query = movementQuerySchema.safeParse({ period: params.get("period") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, undatedPage: Number(params.get("undatedPage") ?? 1) });
  if (!query.success || movementURL({ ...query.data, undatedPage: Math.min(query.data.undatedPage, parsed.data.undatedPages) }) !== movementURL(parsed.data.query)) throw new MovementRefreshError(502);
  return parsed.data;
}
