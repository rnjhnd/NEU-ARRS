import "server-only";
import { requireStudent } from "@/lib/auth";
import { RequestForm } from "./request-form";
import { readPublicSetting, loadStudentCatalog } from "@/lib/configuration-data";
import type { StudentCatalogItem } from "@/lib/configuration-model";

export async function NewRequestData() {
  let paused = false, unavailable = false, actorId = "";
  let catalog: StudentCatalogItem[] = [], methods = { online: true, cash: true };
  try {
    actorId = await requireStudent();
    paused = (await readPublicSetting("MAINTENANCE_MODE")) === "true";
    if (!paused) {
      const [items, payments] = await Promise.all([loadStudentCatalog(), readPublicSetting("PAYMENT_METHODS")]);
      catalog = items; methods = JSON.parse(payments);
    }
  } catch { unavailable = true; }
  if (unavailable) return <section role="status" className="space-y-3 p-6"><h2 className="text-2xl font-bold">Request settings unavailable</h2><p>The request catalog or payment settings could not be verified. Please try again later or contact the registrar. Existing request history remains available.</p></section>;
  if (paused) return <section role="status" className="space-y-3 p-6"><h2 className="text-2xl font-bold">New requests paused</h2><p>The registrar is currently not accepting new document requests. Your existing request history remains available.</p></section>;
  if (!catalog.length) return <section role="status" className="space-y-3 p-6"><h2 className="text-2xl font-bold">No documents available</h2><p>No active documents have been configured. Please contact the registrar.</p></section>;
  return <RequestForm actorId={actorId} documentConfigs={catalog} paymentMethods={methods} />;
}
