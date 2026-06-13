import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function StudentDashboardLoading() {
  return (
    <div className="space-y-8 w-full animate-pulse">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="h-8 w-48 bg-muted rounded-md mb-2"></div>
          <div className="h-4 w-64 bg-muted/60 rounded-md"></div>
        </div>
        <div className="h-10 w-32 bg-muted rounded-md"></div>
      </div>

      <Card className="shadow-sm border-border overflow-hidden pb-0">
        <CardHeader className="bg-muted/10 border-b border-border pb-6">
          <div className="h-6 w-40 bg-muted rounded-md mb-2"></div>
          <div className="h-4 w-72 bg-muted/60 rounded-md"></div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full">
            <div className="h-12 border-b border-border bg-muted/30"></div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 border-b border-border flex items-center px-6 gap-4">
                <div className="h-4 w-16 bg-muted/60 rounded"></div>
                <div className="h-4 w-32 bg-muted/60 rounded"></div>
                <div className="h-4 w-24 bg-muted/60 rounded"></div>
                <div className="h-4 w-24 bg-muted/60 rounded"></div>
                <div className="h-4 w-20 bg-muted/60 rounded ml-auto"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
