"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutDashboard, PieChart, Settings, Users } from "lucide-react";
import { adminNavigation, isNavigationActive } from "@/lib/admin-navigation";
import type { DisplayRole } from "@/lib/profile-identity";
import { cn } from "@/lib/utils";

const icons = { dashboard: LayoutDashboard, documents: FileText, finance: PieChart, students: Users, settings: Settings };

export function AdminNavLinks({ role, collapsed = false, onNavigate }: {
  role?: DisplayRole;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return <nav aria-label="Staff navigation" className="flex-1 space-y-2 p-4 overflow-y-auto overflow-x-hidden no-scrollbar">
    {adminNavigation(role).map(route => {
      const active = isNavigationActive(pathname, route.href);
      const Icon = icons[route.icon];
      return <div key={route.href} className={route.icon === "settings" ? "pt-2 mt-2 border-t border-primary/10" : undefined}>
        <Link href={route.href} onNavigate={onNavigate} title={collapsed ? route.label : undefined}
          aria-current={active ? "page" : undefined}
          className={cn("flex items-center gap-3 py-2.5 px-3 transition-all duration-300 rounded-xl whitespace-nowrap",
            active ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-bold shadow-sm border border-primary/10"
              : "text-muted-foreground hover:bg-primary/5 hover:text-foreground font-medium border border-transparent",
            collapsed && "justify-center")}>
          <Icon aria-hidden="true" className={cn("w-5 h-5 flex-shrink-0 transition-colors", active && "text-primary")} />
          <span className={collapsed ? "sr-only" : undefined}>{route.label}</span>
        </Link>
      </div>;
    })}
  </nav>;
}
