import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { DocumentsData } from "./documents-data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Document Management" };

function DocumentsSkeleton() {
  return (
    <Card className="shadow-sm border-border !pb-0 mt-8">
      <CardHeader className="border-b pb-6 px-8 pt-8 bg-gradient-to-r from-primary/5 to-transparent">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="p-0">
        <div className="w-full">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="border-b border-border/50 bg-transparent hover:bg-transparent">
                <TableHead className="pl-8 w-[25%]"><Skeleton className="h-4 w-24" /></TableHead>
                <TableHead className="w-[35%]"><Skeleton className="h-4 w-32" /></TableHead>
                <TableHead className="w-[15%]"><Skeleton className="h-4 w-16" /></TableHead>
                <TableHead className="w-[15%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableHead>
                <TableHead className="pr-8 w-[10%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i} className="border-b border-border/40 last:border-0">
                  <TableCell className="pl-8 py-4">
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                  <TableCell className="py-4">
                    <Skeleton className="h-4 w-full max-w-[250px]" />
                  </TableCell>
                  <TableCell className="py-4">
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </TableCell>
                  <TableCell className="text-right py-4">
                    <div className="flex justify-end"><Skeleton className="h-5 w-16" /></div>
                  </TableCell>
                  <TableCell className="text-right pr-8 py-4">
                    <div className="flex justify-end gap-2">
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DocumentsPage() {
  await requireAdmin();

  return (
    <div className="space-y-8 w-full">
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-8 sm:p-10 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 rounded-full bg-primary/20 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
              Document Management
            </h1>
            <p className="text-white/90 text-lg font-medium max-w-xl">
              Configure dynamic pricing and availability for official university documents.
            </p>
          </div>
        </div>
      </div>

      <Suspense fallback={<DocumentsSkeleton />}>
        <DocumentsData />
      </Suspense>
    </div>
  );
}
