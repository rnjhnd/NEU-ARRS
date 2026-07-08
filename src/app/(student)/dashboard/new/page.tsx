import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestForm } from "./request-form";
import { getDocumentConfigs, getSystemSetting } from "@/app/actions/admin.actions";
import { DocumentConfig } from "@prisma/client";
import { AlertCircle } from "lucide-react";

export const metadata = { title: "New Document Request" };

export default async function NewRequestPage() {
  // Check Maintenance Mode
  const maintenanceSetting = await getSystemSetting("MAINTENANCE_MODE");
  const isMaintenanceMode = maintenanceSetting.success && maintenanceSetting.value === "true";

  if (isMaintenanceMode) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center text-center mt-20 space-y-6">
        <div className="p-6 bg-red-500/10 rounded-full text-red-500">
          <AlertCircle className="w-16 h-16" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight">System Under Maintenance</h2>
        <p className="text-muted-foreground text-lg max-w-xl">
          The registrar's office is currently not accepting new document requests. Please check back later. If you have an existing request, you can still track its status from your dashboard.
        </p>
      </div>
    );
  }

  // Fetch configs
  const configs = await getDocumentConfigs();
  const activeConfigs = configs.filter((c: DocumentConfig) => c.isActive);

  // Fetch payment methods
  const paymentSetting = await getSystemSetting("PAYMENT_METHODS");
  const paymentMethods = paymentSetting.success && paymentSetting.value 
    ? JSON.parse(paymentSetting.value) 
    : { online: true, cash: true };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight">Request Document</h2>
        <p className="text-muted-foreground mt-1 text-lg">
          Select the documents you need and proceed to checkout.
        </p>
      </div>

      <RequestForm documentConfigs={activeConfigs} paymentMethods={paymentMethods} />
    </div>
  );
}
