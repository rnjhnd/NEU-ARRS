import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestForm } from "./request-form";
import { getDocumentConfigs } from "@/app/actions/admin.actions";
import { DocumentConfig } from "@prisma/client";

export const metadata = { title: "New Document Request" };

export default async function NewRequestPage() {
  const configs = await getDocumentConfigs();
  const activeConfigs = configs.filter((c: DocumentConfig) => c.isActive);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Request Document</h2>
        <p className="text-muted-foreground mt-1">
          Select the documents you need and proceed to checkout.
        </p>
      </div>

      <Card className="shadow-sm border-border bg-card">
        <CardHeader>
          <CardTitle>Document Details</CardTitle>
          <CardDescription>Please provide the details of your request below.</CardDescription>
        </CardHeader>
        <CardContent>
          <RequestForm documentConfigs={activeConfigs} />
        </CardContent>
      </Card>
    </div>
  );
}
