import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function AdminQueueLoading() {
  return (
    <div className="space-y-8 w-full animate-pulse">
      {/* At-A-Glance Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="shadow-sm border-border bg-card">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <div className="h-4 w-24 bg-muted rounded-md mb-3"></div>
                <div className="h-8 w-12 bg-muted rounded-md"></div>
              </div>
              <div className="w-12 h-12 bg-muted/50 rounded-xl"></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 w-20 bg-muted rounded-full"></div>
        ))}
      </div>

      <Card className="shadow-sm border-border overflow-hidden pb-0">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4 mb-4">
          <div>
            <div className="h-6 w-32 bg-muted rounded-md mb-2"></div>
            <div className="h-4 w-64 bg-muted/60 rounded-md"></div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full">
            <div className="h-12 border-b border-border bg-muted/30"></div>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-16 border-b border-border flex items-center px-6 gap-6">
                <div className="h-4 w-4 bg-muted rounded"></div>
                <div className="h-4 w-16 bg-muted/60 rounded"></div>
                <div className="h-4 w-32 bg-muted/60 rounded"></div>
                <div className="h-8 w-24 bg-muted/60 rounded ml-auto"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
