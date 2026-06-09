import { requireAdmin } from "@/lib/auth";
import { clerkClient } from "@clerk/nextjs/server";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Admin Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  
  const client = await clerkClient();
  const response = await client.users.getUserList({ limit: 100 });
  
  const users = response.data.map(u => ({
    id: u.id,
    name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Unnamed",
    email: u.emailAddresses[0]?.emailAddress || "No email",
    isAdmin: u.publicMetadata?.role === "admin"
  }));
  
  return <SettingsClient users={users} />;
}
