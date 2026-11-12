export const ACCOUNT_LIMIT = 5000;
export type AccountProvider = { getUserList: (params: { limit: number; offset: number; orderBy: "+created_at" }) => Promise<{
  totalCount: number; data: { id: string; firstName: string | null; lastName: string | null; imageUrl: string;
    publicMetadata: { role?: unknown }; primaryEmailAddressId: string | null; emailAddresses: { id: string; emailAddress: string }[] }[];
}> };
export class AccountSnapshotError extends Error { constructor(readonly status: 413 | 503) { super("A complete account snapshot is unavailable."); } }
export async function readClerkAccounts(provider: AccountProvider) {
  const accounts: Awaited<ReturnType<AccountProvider["getUserList"]>>["data"] = [];
  const seen = new Set<string>(); let expected: number | undefined; const started = Date.now();
  for (let offset = 0; offset < ACCOUNT_LIMIT; offset += 500) {
    const { data, totalCount } = await provider.getUserList({ limit: 500, offset, orderBy: "+created_at" });
    if (!Number.isSafeInteger(totalCount) || totalCount < 0 || (expected !== undefined && expected !== totalCount) || Date.now() - started > 20_000) throw new AccountSnapshotError(503);
    if (totalCount > ACCOUNT_LIMIT) throw new AccountSnapshotError(413);
    expected = totalCount;
    if (data.length !== Math.min(500, totalCount - offset)) throw new AccountSnapshotError(503);
    for (const user of data) { if (seen.has(user.id)) throw new AccountSnapshotError(503); seen.add(user.id); accounts.push(user); }
    if (accounts.length === totalCount) return accounts;
  }
  throw new AccountSnapshotError(503);
}
