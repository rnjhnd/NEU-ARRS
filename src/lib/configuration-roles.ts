import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "./auth";
import { readClerkAccounts, AccountSnapshotError } from "./clerk-account-snapshot";
import { rolesSnapshotSchema } from "./configuration-fetcher";
export async function loadRoleAccounts() {
  const actorId = await requireAdmin(); const provider = await clerkClient();
  const accounts = await readClerkAccounts(provider.users);
  const result = rolesSnapshotSchema.parse({ actorId, asOf: new Date().toISOString(), users: accounts.map(user => ({ id: user.id,
    name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Unnamed User", email: user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress ?? null,
    role: user.publicMetadata.role == null || user.publicMetadata.role === "student" ? "student" : user.publicMetadata.role === "admin" || user.publicMetadata.role === "employee" ? user.publicMetadata.role : "unknown" })) });
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 2_000_000) throw new AccountSnapshotError(413);
  return result;
}
