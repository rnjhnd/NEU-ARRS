import { requireAdmin } from "@/lib/auth";
import { getDocumentConfigs } from "@/app/actions/admin.actions";
import { DocumentClient } from "./document-client";

export const metadata = { title: "Document Management" };

export default async function DocumentsPage() {
  await requireAdmin();
  const configs = await getDocumentConfigs();
  
  return <DocumentClient initialConfigs={configs} />;
}
