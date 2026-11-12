import { requireAdmin } from "@/lib/auth";
import { loadAdminDocuments } from "@/lib/configuration-data";
import type { DocumentsSnapshot } from "@/lib/configuration-model";
import { DocumentClient } from "./document-client";

export async function DocumentsData() {
  const actorId = await requireAdmin(); let data: DocumentsSnapshot | undefined;
  try { data = await loadAdminDocuments(); } catch { /* Recoverable unavailable state; no read-time writes. */ }
  return <DocumentClient actorId={actorId} initialData={data} initialError={data ? undefined : "Document catalog unavailable. Refresh to try again."} />;
}
