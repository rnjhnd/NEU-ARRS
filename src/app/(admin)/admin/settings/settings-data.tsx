import { requireAdmin } from "@/lib/auth";
import { loadAdminSettings } from "@/lib/configuration-data";
import { loadRoleAccounts } from "@/lib/configuration-roles";
import { SettingsClient } from "./settings-client";

export async function SettingsData() {
  const actorId = await requireAdmin();
  const [settings, roles] = await Promise.allSettled([loadAdminSettings(), loadRoleAccounts()]);
  return <SettingsClient actorId={actorId} initialSettings={settings.status === "fulfilled" ? settings.value : undefined} initialRoles={roles.status === "fulfilled" ? roles.value : undefined} />;
}
