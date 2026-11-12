import { getVerifiedActor, AccessError } from "./auth";
import { clerkClient } from "@clerk/nextjs/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import prisma from "./prisma";
import { adminQueueSelect, adminQueueSchema, toQueueItem, queueCSV, queueQuerySchema, queueExportSchema, DEFAULT_QUEUE_QUERY, QUEUE_PAGE_SIZE, QUEUE_EXPORT_LIMIT, QUEUE_RESPONSE_BYTES, type AdminQueue, type QueueQuery, type QueueExportQuery } from "./admin-queue-model";
import { queueDocumentLabel, queueWhere, queueOrder } from "./admin-queue-query";
import { manilaDay } from "./finance-model";

type Users = Awaited<ReturnType<typeof clerkClient>>["users"];
export class QueueLoadError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 413 | 503, message?: string) {
    super(message ?? (status === 413 ? "Too many results. Narrow the search or export creation-date range." : status === 401 || status === 403 ? "Staff authorization required." : "The requested queue view could not be verified. Refresh to try again."));
  }
}
export async function getAdminQueueActor(): Promise<Pick<AdminQueue, "actorId" | "role">> {
  let actor;
  try { actor = await getVerifiedActor(); } catch (error) { if (error instanceof AccessError) throw new QueueLoadError(error.status); throw error; }
  if (actor.role !== "admin" && actor.role !== "employee") throw new QueueLoadError(403);
  return { actorId: actor.userId, role: actor.role };
}
async function matchingEmails(search: string, provider: Users) {
  if (!search) return [];
  const ids: string[] = [], seen = new Set<string>(); let expected: number | undefined; const started = Date.now();
  for (let offset = 0; offset < 5000; offset += 500) {
    const { data, totalCount } = await provider.getUserList({ query: search, limit: 500, offset, orderBy: "+created_at" });
    if (totalCount > 5000) throw new QueueLoadError(413, "Too many matching profiles. Narrow your search.");
    if (!Number.isSafeInteger(totalCount) || totalCount < 0 || expected !== undefined && expected !== totalCount || data.length !== Math.min(500, totalCount - offset) || Date.now() - started > 20_000) throw new QueueLoadError(503);
    expected = totalCount;
    for (const user of data) {
      if (seen.has(user.id)) throw new QueueLoadError(503); seen.add(user.id);
      const primary = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress;
      if (primary?.toLowerCase().includes(search.toLowerCase())) ids.push(user.id);
    }
    if (offset + data.length === totalCount) return ids;
  }
  throw new QueueLoadError(413);
}
async function pageEmails(ids: string[], supplied?: Users) {
  const emails = new Map<string, string | null>(); let emailLookupFailed = false;
  if (!ids.length) return { emails, emailLookupFailed };
  const started = Date.now();
  try {
    const provider = supplied ?? (await clerkClient()).users;
    for (let offset = 0; offset < ids.length; offset += 300) {
      if (Date.now() - started > 20_000) { emailLookupFailed = true; break; }
      await Promise.all([0, 100, 200].map(async start => {
        const userId = ids.slice(offset + start, offset + start + 100); if (!userId.length) return;
        try {
          const { data } = await provider.getUserList({ userId, limit: 100 }); const allowed = new Set(userId);
          for (const user of data) if (allowed.has(user.id)) emails.set(user.id, user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress ?? null);
        } catch { emailLookupFailed = true; }
      }));
    }
  } catch { emailLookupFailed = true; }
  return { emails, emailLookupFailed };
}
export async function loadAdminQueue(input: QueueQuery = DEFAULT_QUEUE_QUERY, db: PrismaClient = prisma, supplied?: Users): Promise<AdminQueue> {
  const actor = await getAdminQueueActor(); const query = queueQuerySchema.parse(input);
  let emailIds: string[] = [];
  if (query.search) {
    try { emailIds = await matchingEmails(query.search, supplied ?? (await clerkClient()).users); }
    catch (error) { if (error instanceof QueueLoadError) throw error; throw new QueueLoadError(503); }
  }
  const where = queueWhere(query, emailIds);
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
    const [summary] = await tx.$queryRaw<AdminQueue["summary"][]>(Prisma.sql`SELECT count(*)::int AS total,
      (count(*) FILTER (WHERE "status" = 'PENDING_PAYMENT'))::int AS pending,
      (count(*) FILTER (WHERE "status" = 'PROCESSING'))::int AS processing,
      (count(*) FILTER (WHERE "status" = 'READY_FOR_PICKUP'))::int AS ready FROM "Request"`);
    const [count] = await tx.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::int AS total FROM "Request" r LEFT JOIN "DocumentConfig" d ON d."typeId" = r."documentType" WHERE ${where}`);
    const totalPages = Math.max(1, Math.ceil(count.total / QUEUE_PAGE_SIZE)), page = Math.min(query.page, totalPages);
    const ids = await tx.$queryRaw<{ id: string; label: string }[]>(Prisma.sql`SELECT r."id", ${queueDocumentLabel} AS label FROM "Request" r LEFT JOIN "DocumentConfig" d ON d."typeId" = r."documentType"
      WHERE ${where} ORDER BY ${queueOrder(query)} LIMIT ${QUEUE_PAGE_SIZE} OFFSET ${(page - 1) * QUEUE_PAGE_SIZE}`);
    const rows = ids.length ? await tx.request.findMany({ where: { id: { in: ids.map(row => row.id) } }, select: adminQueueSelect, take: QUEUE_PAGE_SIZE }) : [];
    if (rows.length !== ids.length) throw new QueueLoadError(503);
    const byId = new Map(rows.map(row => [row.id, row]));
    return { summary, total: count.total, totalPages, query: { ...query, page }, ordered: ids.map(item => ({ row: byId.get(item.id)!, label: item.label })) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 2000, timeout: 8000 });
  const { emails, emailLookupFailed } = await pageEmails([...new Set(result.ordered.map(item => item.row.studentId))], supplied);
  const queue = adminQueueSchema.parse({ ...actor, query: result.query, summary: result.summary, total: result.total, totalPages: result.totalPages,
    emailLookupFailed, items: result.ordered.map(({ row, label }) => toQueueItem(row, emails.get(row.studentId) ?? null, label)) });
  if (Buffer.byteLength(JSON.stringify(queue), "utf8") > QUEUE_RESPONSE_BYTES) throw new QueueLoadError(413);
  return queue;
}
export async function loadQueueExport(input: QueueExportQuery, db: PrismaClient = prisma, supplied?: Users, now = new Date()) {
  const actor = await getAdminQueueActor(); const query = queueExportSchema.parse(input);
  if (query.to && query.to > manilaDay(now.toISOString())) throw new QueueLoadError(400, "Choose export dates on or before today.");
  const createdAt = { lte: now, ...(query.from ? { gte: new Date(query.from + "T00:00:00+08:00"), lt: new Date(Date.parse(query.to! + "T00:00:00+08:00") + 86_400_000) } : {}) };
  const { rows, configs } = await db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
    const rows = await tx.request.findMany({ where: { createdAt }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: adminQueueSelect, take: QUEUE_EXPORT_LIMIT + 1 });
    if (rows.length > QUEUE_EXPORT_LIMIT) throw new QueueLoadError(413, "Export exceeds 5,000 requests. Choose a shorter creation-date range.");
    const configs = rows.length ? await tx.documentConfig.findMany({ where: { typeId: { in: [...new Set(rows.map(row => row.documentType))] } }, select: { typeId: true, label: true } }) : [];
    return { rows, configs };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 2000, timeout: 8000 });
  const { emails, emailLookupFailed } = await pageEmails([...new Set(rows.map(row => row.studentId))], supplied);
  const labels = new Map(configs.map(config => [config.typeId, config.label]));
  const csv = "\uFEFF" + queueCSV(rows.map(row => toQueueItem(row, emails.get(row.studentId) ?? null, labels.get(row.documentType))));
  if (Buffer.byteLength(csv, "utf8") > QUEUE_RESPONSE_BYTES) throw new QueueLoadError(413, "Export exceeds 5 MB. Choose a shorter creation-date range.");
  return { ...actor, csv, emailLookupFailed };
}
