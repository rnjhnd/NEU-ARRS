"use client";

import { CheckCircle, Clock, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { StudentHistory } from "@/lib/student-request-model";

export function RequestSummary({ summary }: { summary: StudentHistory["summary"] }) {
  const cards = [
    { label: "Active Requests", value: summary.active, icon: Clock },
    { label: "Completed", value: summary.completed, icon: CheckCircle },
    { label: "Total Requests", value: summary.total, icon: FileText },
  ];
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
    {cards.map(({ label, value, icon: Icon }) => <Card key={label} className="shadow-sm border-border bg-card rounded-3xl">
      <CardContent className="p-6 flex items-center gap-5">
        <div className="p-4 bg-primary/10 text-primary rounded-2xl shrink-0"><Icon aria-hidden="true" className="w-6 h-6" /></div>
        <div><p className="text-sm font-semibold text-muted-foreground">{label}</p><p className="text-3xl font-bold">{value}</p></div>
      </CardContent>
    </Card>)}
  </div>;
}
