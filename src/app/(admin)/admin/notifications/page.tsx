import { withVerifiedPage } from "@/components/verified-page";
import { requireAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NotificationQueue } from "./notification-queue";
import Link from "next/link";
import { z } from "zod";
import { Suspense } from "react";
import { NotificationsShell, NotificationsSkeleton } from "./page-shell";

async function NotificationsData({ searchParams }: { searchParams: Promise<{ after?: string | string[] }> }) {
  await requireAdmin();
  const parsed = z.string().cuid().safeParse((await searchParams).after);
  const after = parsed.success ? parsed.data : undefined;
  const rows = await prisma.notificationOutbox.findMany({
    where: { state: { in: ["QUEUED", "IN_FLIGHT", "REVIEW"] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 51,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    select: { id: true, requestId: true, status: true, state: true, attempts: true, lastError: true, updatedAt: true, createdAt: true, firstAttemptAt: true },
  });
  const page = rows.slice(0, 50);
  return <>
    <NotificationQueue rows={page.map(row => ({ ...row, updatedAt: row.updatedAt.toISOString(), createdAt: row.createdAt.toISOString(), firstAttemptAt: row.firstAttemptAt?.toISOString() ?? null }))} />
    <nav aria-label="Notification pages" className="flex gap-4">
      {after && <Link href="/admin/notifications">First page</Link>}
      {rows.length > 50 && <Link href={`/admin/notifications?after=${encodeURIComponent(page[49].id)}`}>Next page</Link>}
    </nav>
  </>;
}

async function NotificationsPage(props: { searchParams: Promise<{ after?: string | string[] }> }) {
  return <NotificationsShell><Suspense fallback={<NotificationsSkeleton />}><NotificationsData {...props} /></Suspense></NotificationsShell>;
}

export default withVerifiedPage(NotificationsPage, ["admin"]);
