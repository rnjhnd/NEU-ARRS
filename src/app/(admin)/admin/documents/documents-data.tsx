import { getDocumentConfigs } from "@/app/actions/admin.actions";
import { DocumentClient } from "./document-client";

export async function DocumentsData() {
  const configs = await getDocumentConfigs();
  return <DocumentClient initialConfigs={configs} />;
}
