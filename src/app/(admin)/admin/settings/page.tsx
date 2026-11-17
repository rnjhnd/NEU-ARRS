import { SettingsShell, SettingsSkeleton } from "./page-shell";
import { withVerifiedPage } from "@/components/verified-page";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { SettingsData } from "./settings-data";

export const metadata = { title: "Admin Settings" };

async function SettingsPage() {
  await requireAdmin();

  return (
    <SettingsShell>

      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsData />
      </Suspense>
    </SettingsShell>
  );
}

export default withVerifiedPage(SettingsPage, ["admin"]);
