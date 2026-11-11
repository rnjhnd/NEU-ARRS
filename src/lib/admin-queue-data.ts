import { auth, clerkClient } from "@clerk/nextjs/server";
import prisma from "./prisma";
import { adminQueueSelect, toQueueItem, type AdminQueue } from "./admin-queue-model";

export class QueueAccessError extends Error {
  constructor(readonly status: 401 | 403) { super("Staff authorization required."); }
}
export async function getAdminQueueActor(): Promise<Pick<AdminQueue, "actorId" | "role">> {
  const { userId, sessionClaims } = await auth();
  if (!userId) throw new QueueAccessError(401);
  const role = sessionClaims?.metadata?.role;
  if (role !== "admin" && role !== "employee") throw new QueueAccessError(403);
  return { actorId: userId, role };
}
export async function loadAdminQueue(): Promise<AdminQueue> {
  const { actorId, role } = await getAdminQueueActor();
  const [rows, configs] = await Promise.all([
    prisma.request.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "asc" }], select: adminQueueSelect }),
    prisma.documentConfig.findMany({ select: { typeId: true, label: true } }),
  ]);
  const ids = [...new Set(rows.map(row => row.studentId))];
  const emails = new Map<string, string | null>();
  let emailLookupFailed = false;
  if (ids.length) {
    try {
      const client = await clerkClient();
      // Clerk accepts at most 100 user IDs per lookup. Limit concurrency too.
      for (let offset = 0; offset < ids.length; offset += 300) {
        await Promise.all([0, 100, 200].map(async start => {
          const userId = ids.slice(offset + start, offset + start + 100);
          if (!userId.length) return;
          try {
            const { data } = await client.users.getUserList({ userId, limit: 100 });
            const allowed = new Set(userId);
            for (const user of data) if (allowed.has(user.id)) emails.set(user.id,
              user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress ?? null);
          } catch { emailLookupFailed = true; }
        }));
      }
    } catch { emailLookupFailed = true; }
  }
  const labels = new Map(configs.map(config => [config.typeId, config.label]));
  return { actorId, role, emailLookupFailed, items: rows.map(row => toQueueItem(row, emails.get(row.studentId) ?? null, labels.get(row.documentType))) };
}
