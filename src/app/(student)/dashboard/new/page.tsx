import { RequestForm } from "./request-form";
import { readPublicSetting, loadStudentCatalog } from "@/lib/configuration-data";
import type { StudentCatalogItem } from "@/lib/configuration-model";

export const metadata = { title: "New Document Request" };

export default async function NewRequestPage() {
  let paused = false, unavailable = false;
  let catalog: StudentCatalogItem[] = [], methods = { online: true, cash: true };
  try {
    paused = (await readPublicSetting("MAINTENANCE_MODE")) === "true";
    if (!paused) {
      const [items, payments] = await Promise.all([loadStudentCatalog(), readPublicSetting("PAYMENT_METHODS")]);
      catalog = items; methods = JSON.parse(payments);
    }
  } catch { unavailable = true; }
  if (unavailable) return <main className="space-y-3 p-6"><h1 className="text-2xl font-bold">Request settings unavailable</h1><p>The request catalog or payment settings could not be verified. Please try again later or contact the registrar. Existing request history remains available.</p></main>;
  if (paused) return <main className="space-y-3 p-6"><h1 className="text-2xl font-bold">New requests paused</h1><p>The registrar is currently not accepting new document requests. Your existing request history remains available.</p></main>;
  if (!catalog.length) return <main className="space-y-3 p-6"><h1 className="text-2xl font-bold">No documents available</h1><p>No active documents have been configured. Please contact the registrar.</p></main>;
  return <div className="mx-auto max-w-6xl space-y-8"><header><h1 className="text-3xl font-bold">Request Document</h1><p className="text-muted-foreground">Select a document and a payment method to continue.</p></header><RequestForm documentConfigs={catalog} paymentMethods={methods} /></div>;
}
