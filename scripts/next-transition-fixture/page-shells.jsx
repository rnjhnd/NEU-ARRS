import { DashboardShell, DashboardSkeleton } from "@/app/(student)/dashboard/page-shell";
import { NewRequestShell, RequestFormSkeleton } from "@/app/(student)/dashboard/new/page-shell";
import { CommandCenterShell, AdminQueueSkeleton } from "@/app/(admin)/admin/page-shell";
import { StudentsShell, StudentsSkeleton } from "@/app/(admin)/admin/students/page-shell";
import { DocumentsShell, DocumentsSkeleton } from "@/app/(admin)/admin/documents/page-shell";
import { SettingsShell, SettingsSkeleton } from "@/app/(admin)/admin/settings/page-shell";
import { FinanceShell, FinanceSkeleton } from "@/app/(admin)/admin/finance/page-shell";
import { MovementsShell, MovementsSkeleton } from "@/app/(admin)/admin/finance/movements/page-shell";
import { NotificationsShell, NotificationsSkeleton } from "@/app/(admin)/admin/notifications/page-shell";

export const routes = {
  "/dashboard": [DashboardShell, DashboardSkeleton],
  "/dashboard/new": [NewRequestShell, RequestFormSkeleton],
  "/admin": [CommandCenterShell, AdminQueueSkeleton],
  "/admin/students": [StudentsShell, StudentsSkeleton],
  "/admin/documents": [DocumentsShell, DocumentsSkeleton],
  "/admin/settings": [SettingsShell, SettingsSkeleton],
  "/admin/finance": [FinanceShell, FinanceSkeleton],
  "/admin/finance/movements": [MovementsShell, MovementsSkeleton],
  "/admin/notifications": [NotificationsShell, NotificationsSkeleton],
};
export function PageShell({ path, loaded = false, children }) {
  const [Shell] = routes[path];
  return <Shell {...(path === "/dashboard" && loaded ? { firstName: "Synthetic", isMaintenanceMode: false } : {})}>{children}</Shell>;
}
export function PageSkeleton({ path }) { const [, Skeleton] = routes[path]; return <Skeleton />; }
export function LoadingShell({ path }) { return <PageShell path={path}><PageSkeleton path={path} /></PageShell>; }
