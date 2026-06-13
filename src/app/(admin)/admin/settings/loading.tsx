import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Hero Banner Skeleton */}
      <div className="relative overflow-hidden rounded-3xl bg-muted/40 p-8 sm:p-10 border border-border/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-3">
            <Skeleton className="h-10 w-64 sm:w-80" />
            <Skeleton className="h-6 w-full sm:w-96" />
          </div>
          <Skeleton className="h-12 w-full sm:w-64 rounded-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-sm border-border md:col-span-1 h-fit">
          <CardHeader>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border md:col-span-2">
          <CardHeader className="border-b pb-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-10 w-64" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full">
              <div className="border-b bg-muted/30 p-4 flex justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-24" />
              </div>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="border-b p-4 flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-8 w-24 rounded-full" />
                  <Skeleton className="h-8 w-32" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
