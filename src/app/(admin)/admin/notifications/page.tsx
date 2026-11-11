import { requireAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NotificationQueue } from "./notification-queue";
import Link from "next/link";
import { z } from "zod";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ after?: string | string[] }> }) {
  await requireAdmin();
  const parsed = z.string().cuid().safeParse((await searchParams).after);
  const after = parsed.success ? parsed.data : undefined;
  const rows = await prisma.notificationOutbox.findMany({
    where: { state: { in: ["QUEUED", "IN_FLIGHT", "REVIEW"] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 51,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    select: { id: true, requestId: true, status: true, state: true, attempts: true, lastError: true, updatedAt: true, createdAt: true, firstAttemptAt: true },
  });
  const page = rows.slice(0, 50);
  return <div className="space-y-6"><h1 className="text-3xl font-bold">Notification recovery</h1>
    <p>Pending and review items, oldest first (50 per page). Accepted emails are recorded separately; provider acceptance does not confirm inbox delivery.</p>
    <NotificationQueue rows={page.map(row => ({ ...row, updatedAt: row.updatedAt.toISOString(), createdAt: row.createdAt.toISOString(), firstAttemptAt: row.firstAttemptAt?.toISOString() ?? null }))} />
    <nav aria-label="Notification pages" className="flex gap-4">
      {after && <Link href="/admin/notifications">First page</Link>}
      {rows.length > 50 && <Link href={`/admin/notifications?after=${encodeURIComponent(page[49].id)}`}>Next page</Link>}
    </nav>
  </div>;
}
