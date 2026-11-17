import { DocumentsShell, DocumentsSkeleton } from "./page-shell";
import { withVerifiedPage } from "@/components/verified-page";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { DocumentsData } from "./documents-data";

export const metadata = { title: "Document Management" };

async function DocumentsPage() {
  await requireAdmin();

  return (
    <DocumentsShell>

      <Suspense fallback={<DocumentsSkeleton />}>
        <DocumentsData />
      </Suspense>
    </DocumentsShell>
  );
}

export default withVerifiedPage(DocumentsPage, ["admin"]);
