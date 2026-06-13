import { requireAdmin } from "@/lib/auth";
import { clerkClient } from "@clerk/nextjs/server";
import { getSystemSetting } from "@/app/actions/admin.actions";
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
  const DEFAULT_TEMPLATES = {
    PENDING_PAYMENT: "We have successfully received your document request. Please complete your payment via PayMongo to proceed with processing.",
    PROCESSING: "We are currently processing your document. Please allow 3-5 business days for completion.",
    READY_FOR_PICKUP: "Great news! Your document is printed and ready for pickup. Please proceed to the Registrar's Office at Window 4 between 8:00 AM and 5:00 PM (Monday-Friday). Don't forget to bring your valid Student ID.",
    COMPLETED: "Your document request has been successfully completed and claimed. Thank you for using the NEU Academic Record Request System!",
    CANCELLED: "Your document request has been cancelled. If you believe this is an error, please contact the Registrar's Office."
  };

  const emailSetting = await getSystemSetting("EMAIL_TEMPLATES");
  const dbTemplates = emailSetting.success && emailSetting.value ? JSON.parse(emailSetting.value) : {};
  const initialEmailTemplates = { ...DEFAULT_TEMPLATES, ...dbTemplates };

  return <SettingsClient users={users} initialEmailTemplates={initialEmailTemplates} />;
}
