import { clerkClient, auth } from "@clerk/nextjs/server";
import { getSystemSetting } from "@/app/actions/admin.actions";
import { SettingsClient } from "./settings-client";

export async function SettingsData() {
  const { userId: currentUserId } = await auth();
  const client = await clerkClient();
  const response = await client.users.getUserList({ limit: 100 });
  
  const users = response.data.map(u => ({
    id: u.id,
    name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Unnamed",
    email: u.emailAddresses[0]?.emailAddress || "No email",
    role: (u.publicMetadata?.role as string) || "student"
  }));
  const opsSetting = await getSystemSetting("OPERATIONS_CONFIG");
  const initialOperationsConfig = opsSetting.success && opsSetting.value 
    ? JSON.parse(opsSetting.value) 
    : { location: "Registrar's Office at Window 4", hours: "8:00 AM to 5:00 PM (Monday-Friday)" };

  const DEFAULT_TEMPLATES = {
    PENDING_PAYMENT: "We have successfully received your document request. Please complete your payment via PayMongo to proceed with processing.",
    PROCESSING: "We are currently processing your document. Please allow 3-5 business days for completion.",
    READY_FOR_PICKUP: `Great news! Your document is printed and ready for pickup. Please proceed to ${initialOperationsConfig.location} between ${initialOperationsConfig.hours}. Don't forget to bring your valid Student ID.`,
    COMPLETED: "Your document request has been successfully completed and claimed. Thank you for using the NEU Academic Record Request System!",
    CANCELLED: "Your document request has been cancelled. If you believe this is an error, please contact the Registrar's Office."
  };

  const emailSetting = await getSystemSetting("EMAIL_TEMPLATES");
  const dbTemplates = emailSetting.success && emailSetting.value ? JSON.parse(emailSetting.value) : {};
  const initialEmailTemplates = { ...DEFAULT_TEMPLATES, ...dbTemplates };

  // Fetch new settings with sensible defaults
  const maintenanceSetting = await getSystemSetting("MAINTENANCE_MODE");
  const initialMaintenanceMode = maintenanceSetting.success && maintenanceSetting.value === "true";

  const paymentSetting = await getSystemSetting("PAYMENT_METHODS");
  const initialPaymentMethods = paymentSetting.success && paymentSetting.value 
    ? JSON.parse(paymentSetting.value) 
    : { online: true, cash: true };

  return (
    <SettingsClient 
      users={users} 
      currentUserId={currentUserId ?? ""}
      initialEmailTemplates={initialEmailTemplates} 
      initialMaintenanceMode={initialMaintenanceMode}
      initialPaymentMethods={initialPaymentMethods}
      initialOperationsConfig={initialOperationsConfig}
    />
  );
}
