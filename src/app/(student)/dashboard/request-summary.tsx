"use client";

import { CheckCircle, Clock, FileText } from "lucide-react";
import { WorkspaceMetric } from "@/components/workspace-ui";
import type { StudentHistory } from "@/lib/student-request-model";

export function RequestSummary({ summary }: { summary: StudentHistory["summary"] }) {
  const cards = [
    { label: "Active Requests", value: summary.active, icon: Clock, tone: "gold" as const },
    { label: "Completed", value: summary.completed, icon: CheckCircle, tone: "green" as const },
    { label: "Total Requests", value: summary.total, icon: FileText, tone: "slate" as const },
  ];
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
    {cards.map(({ label, value, icon, tone }) => <WorkspaceMetric key={label} label={label} value={value} icon={icon} tone={tone} />)}
  </div>;
}
