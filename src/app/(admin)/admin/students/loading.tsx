import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Loading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-80" />
      </div>

      <Card className="shadow-sm border-border !pb-0">
        <CardHeader className="border-b pb-6 px-8 pt-8 bg-gradient-to-r from-primary/5 to-transparent">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-b border-border/50 bg-transparent hover:bg-transparent">
                  <TableHead className="pl-8 w-[35%]"><Skeleton className="h-4 w-16" /></TableHead>
                  <TableHead className="w-[30%]"><Skeleton className="h-4 w-24" /></TableHead>
                  <TableHead className="w-[15%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-20" /></div></TableHead>
                  <TableHead className="pr-8 w-[20%] text-right"><div className="flex justify-end"><Skeleton className="h-4 w-24" /></div></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i} className="border-b border-border/40 last:border-0">
                    <TableCell className="pl-8 py-4">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                        <Skeleton className="h-5 w-32" />
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Skeleton className="h-4 w-48" />
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <div className="flex justify-end"><Skeleton className="h-5 w-20" /></div>
                    </TableCell>
                    <TableCell className="text-right pr-8 py-4">
                      <div className="flex justify-end"><Skeleton className="h-5 w-16" /></div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
