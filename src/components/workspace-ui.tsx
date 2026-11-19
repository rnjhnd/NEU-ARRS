import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Presentation from the last pre-audit UI (4e4cc9e). No data or access logic.
export const workspaceStyles = {
  card: "shadow-sm border-border overflow-hidden bg-card rounded-3xl pt-0 gap-0 !pb-0",
  header: "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50 !py-6 px-6 sm:px-8",
  footer: "flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border/50 bg-muted/10 px-6 sm:px-8 py-4",
  search: "pl-10 pr-5 bg-background/40 hover:bg-background/80 focus:bg-background backdrop-blur-sm border-border/50 shadow-[0_2px_10px_rgba(0,0,0,0.02)] dark:shadow-none rounded-full h-10 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/30",
  button: "rounded-full h-10 px-5",
  select: "h-10 max-w-full rounded-full border border-border/50 bg-background/60 px-4 pr-8 text-sm font-medium shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50",
  field: "w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2.5 text-sm shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50",
  dialog: "rounded-3xl border-border/50 bg-background/95 backdrop-blur-xl p-6 sm:p-8 shadow-2xl [&_[data-slot=dialog-title]]:text-xl [&_[data-slot=dialog-title]]:font-bold [&_[data-slot=dialog-footer]]:mx-0 [&_[data-slot=dialog-footer]]:mb-0 [&_[data-slot=dialog-footer]]:mt-6 [&_[data-slot=dialog-footer]]:rounded-none [&_[data-slot=dialog-footer]]:bg-transparent [&_[data-slot=dialog-footer]]:px-0 [&_[data-slot=dialog-footer]_button]:rounded-full [&_label]:text-sm [&_label]:font-semibold [&_input:not([type=checkbox])]:rounded-xl [&_input:not([type=checkbox])]:h-11 [&_select]:rounded-xl [&_textarea]:rounded-xl",
  notice: "rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground",
  warning: "rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm leading-relaxed text-amber-800 dark:text-amber-300",
  error: "rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-destructive",
};

const tones = {
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  gold: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500",
  green: "bg-primary/10 text-primary",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};
export function WorkspaceMetric({ label, value, icon: Icon, tone = "green", emphasize = false }: {
  label: string; value: ReactNode; icon: LucideIcon; tone?: keyof typeof tones; emphasize?: boolean;
}) {
  return <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
    <CardContent className="p-6 flex flex-1 items-center gap-5">
      <div className={cn("p-4 rounded-2xl shrink-0", tones[tone])}><Icon aria-hidden="true" className="w-6 h-6" /></div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-muted-foreground whitespace-normal break-words">{label}</p>
        <p className={cn("text-3xl font-bold tracking-tight whitespace-normal break-words", emphasize ? "text-primary" : "text-foreground")}>{value}</p>
      </div>
    </CardContent>
  </Card>;
}
