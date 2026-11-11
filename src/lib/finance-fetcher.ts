import { financeDatasetSchema, financeQuerySchema, financeRange, financeURL, manilaDay } from "./finance-model";

export class FinanceRefreshError extends Error {
  constructor(readonly status: number) { super(status === 413 ? "Report exceeds 5,000 requests. Choose a shorter period." : "Finance report could not be refreshed."); }
}
export async function fetchFinanceData([url, actorId]: readonly [string, string]) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (response.redirected) throw new FinanceRefreshError(401);
  if (!response.ok) throw new FinanceRefreshError(response.status);
  const data = financeDatasetSchema.safeParse(await response.json());
  if (!data.success) throw new FinanceRefreshError(502);
  if (data.data.actorId !== actorId) throw new FinanceRefreshError(403);
  const params = new URL(url, "https://finance.invalid").searchParams;
  const query = financeQuerySchema.safeParse({ period: params.get("period") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined });
  if (!query.success || financeURL(query.data) !== financeURL(data.data.query)) throw new FinanceRefreshError(502);
  if (data.data.query.period === "custom" && data.data.query.to! > manilaDay(data.data.asOf)) throw new FinanceRefreshError(502);
  const range = financeRange(data.data.query, data.data.asOf);
  if (data.data.items.some(item => Date.parse(item.createdAt) > Date.parse(data.data.asOf) || (range.start && Date.parse(item.createdAt) < range.start.getTime()) || Date.parse(item.createdAt) >= range.end.getTime())) throw new FinanceRefreshError(502);
  return data.data;
}
