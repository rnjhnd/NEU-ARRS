import { getVerifiedActor, AccessError } from "./auth";
import { clerkClient } from "@clerk/nextjs/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import prisma from "./prisma";
import { readClerkAccounts, AccountSnapshotError, type AccountProvider } from "./clerk-account-snapshot";
import { DIRECTORY_ACCOUNT_LIMIT, directorySchema, directoryTotals, type DirectoryActor, type StudentDirectory } from "./student-directory-model";

const SNAPSHOT_BYTE_LIMIT = 2_000_000;
export class DirectoryLoadError extends Error {
  constructor(readonly status: 401 | 403 | 413 | 503) {
    super(status === 401 || status === 403 ? "Staff authorization required." : status === 413
      ? "This directory is too large to load completely. Contact your system administrator."
      : "The complete student directory could not be verified. Refresh to try again.");
  }
}
export async function requireDirectoryActor(): Promise<DirectoryActor> {
  let actor;
  try { actor = await getVerifiedActor(); } catch (error) { if (error instanceof AccessError) throw new DirectoryLoadError(error.status); throw error; }
  if (actor.role !== "admin" && actor.role !== "employee") throw new DirectoryLoadError(403);
  return { actorId: actor.userId, role: actor.role };
}
export type DirectoryProvider = AccountProvider;
async function readStudents(provider: DirectoryProvider) {
  let accounts: Awaited<ReturnType<AccountProvider["getUserList"]>>["data"];
  try { accounts = await readClerkAccounts(provider); }
  catch (error) { if (error instanceof AccountSnapshotError) throw new DirectoryLoadError(error.status); throw error; }
  return accounts.filter(user => user.publicMetadata.role == null || user.publicMetadata.role === "student").map(user => {
    let imageUrl: string | null = null;
    try { if (new URL(user.imageUrl).protocol === "https:") imageUrl = user.imageUrl; } catch { /* Shared avatar fallback. */ }
    return { id: user.id, name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Unnamed Student", imageUrl,
      email: user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress ?? null };
  });
}

type Aggregate = { studentId: string; requestCount: bigint; collectedCentavos: bigint; unverifiedCount: bigint };
export async function loadDirectoryAggregates(ids: string[], db: PrismaClient = prisma) {
  if (ids.length > DIRECTORY_ACCOUNT_LIMIT || new Set(ids).size !== ids.length) throw new DirectoryLoadError(503);
  if (!ids.length) return new Map<string, Omit<Aggregate, "studentId">>();
  // One grouped statement is a consistent DB snapshot. No request details or
  // legacy monetary units leave Postgres, and every identifier is a bound value.
  const settled = Prisma.sql`r."status" <> 'CANCELLED' AND r."paymentStatus" <> 'REFUNDED' AND
    ((r."paymentMethod" = 'online' AND r."paymentStatus" = 'PAID') OR
     (r."paymentMethod" = 'cash' AND r."status" = 'COMPLETED' AND r."paymentStatus" IN ('PAID', 'CASH_ON_PICKUP')))`;
  const verified = Prisma.sql`m."requestId" IS NOT NULL AND m."currency" = 'PHP' AND m."method" = r."paymentMethod" AND m."collectedCentavos" >= 0`;
  const rows = await db.$queryRaw<Aggregate[]>(Prisma.sql`
    SELECT r."studentId", count(*)::bigint AS "requestCount",
      COALESCE(sum(m."collectedCentavos") FILTER (WHERE ${settled} AND ${verified}), 0)::bigint AS "collectedCentavos",
      (count(*) FILTER (WHERE ${settled} AND NOT (${verified})))::bigint AS "unverifiedCount"
    FROM "Request" r LEFT JOIN "RequestMoney" m ON m."requestId" = r."id"
    WHERE r."studentId" IN (${Prisma.join(ids)}) GROUP BY r."studentId"`);
  const allowed = new Set(ids);
  if (rows.some(row => !allowed.has(row.studentId)) || new Set(rows.map(row => row.studentId)).size !== rows.length) throw new DirectoryLoadError(503);
  return new Map(rows.map(row => [row.studentId, row]));
}
function safeCount(value: bigint) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new DirectoryLoadError(503);
  return number;
}
/** Shared server/API loader; authorization always precedes provider/database IO. */
export async function loadStudentDirectory(db: PrismaClient = prisma, provider?: DirectoryProvider): Promise<StudentDirectory> {
  const actor = await requireDirectoryActor();
  const students = await readStudents(provider ?? (await clerkClient()).users);
  const aggregates = await loadDirectoryAggregates(students.map(student => student.id), db);
  const items = students.map(student => {
    const summary = aggregates.get(student.id);
    return { ...student, requestCount: safeCount(summary?.requestCount ?? BigInt(0)),
      collectedCentavos: safeCount(summary?.collectedCentavos ?? BigInt(0)), unverifiedCount: safeCount(summary?.unverifiedCount ?? BigInt(0)) };
  });
  const directory = directorySchema.parse({ ...actor, asOf: new Date().toISOString(), items, totals: directoryTotals(items) });
  if (Buffer.byteLength(JSON.stringify(directory), "utf8") > SNAPSHOT_BYTE_LIMIT) throw new DirectoryLoadError(413);
  return directory;
}
