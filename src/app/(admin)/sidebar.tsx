"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { ProfileMenu } from "@/components/profile-menu";
import { LayoutDashboard, Settings, ChevronLeft, ChevronRight, Users, PieChart, FileText } from "lucide-react";
import { LogoIcon } from "@/components/logo-icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function Sidebar({ serverRole }: { serverRole: string }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { user } = useUser();
  
  const name = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User" : "Administrator";
  const rawRole = serverRole;
  const role = rawRole === "admin" ? "Administrator" : rawRole === "employee" ? "Employee" : "Student";
  const isAdmin = rawRole === "admin";

  return (
    <motion.aside 
      initial={false}
      animate={{ width: isCollapsed ? 80 : 280 }}
      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
      className="flex-col border-r border-primary/10 bg-background/60 backdrop-blur-xl hidden md:flex relative overflow-visible z-20 h-full"
    >
      <Button
        variant="outline"
        size="icon"
        className="absolute -right-4 top-[22px] h-8 w-8 rounded-full border bg-card dark:bg-muted shadow-sm z-50 hover:bg-muted dark:hover:bg-muted/80"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>

      <div className="flex pt-6 pb-4 items-start px-6 border-b overflow-hidden whitespace-nowrap">
        <Link href="/admin" className="flex items-center gap-2">
          <LogoIcon className="h-6 w-6 text-primary dark:text-primary flex-shrink-0" sealColor="text-yellow-600 dark:text-yellow-500" />
          {!isCollapsed && (
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-lg font-bold tracking-tight"
            >
              NEU <span className="font-normal text-muted-foreground">ARRS</span>
            </motion.span>
          )}
        </Link>
      </div>
      
      <nav className="flex-1 space-y-2 p-4 overflow-hidden whitespace-nowrap">
        <Link 
          href="/admin" 
          className={`flex items-center gap-3 py-2.5 px-3 transition-all rounded-xl ${
            pathname === "/admin" 
              ? "bg-primary/10 text-primary font-bold shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground font-medium"
          } ${isCollapsed ? "justify-center" : ""}`}
          title="Command Center"
        >
          <LayoutDashboard className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin" ? "text-primary" : ""}`} />
          {!isCollapsed && <span>Command Center</span>}
        </Link>
        {isAdmin && (
          <Link 
            href="/admin/documents" 
            className={`flex items-center gap-3 py-2.5 px-3 transition-all rounded-xl ${
              pathname === "/admin/documents" 
                ? "bg-primary/10 text-primary font-bold shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground font-medium"
            } ${isCollapsed ? "justify-center" : ""}`}
            title="Document Management"
          >
            <FileText className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin/documents" ? "text-primary" : ""}`} />
            {!isCollapsed && <span>Document Management</span>}
          </Link>
        )}
        {isAdmin && (
          <Link 
            href="/admin/finance" 
            className={`flex items-center gap-3 py-2.5 px-3 transition-all rounded-xl ${
              pathname === "/admin/finance" 
                ? "bg-primary/10 text-primary font-bold shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground font-medium"
            } ${isCollapsed ? "justify-center" : ""}`}
            title="Financial Analytics"
          >
            <PieChart className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin/finance" ? "text-primary" : ""}`} />
            {!isCollapsed && <span>Financial Analytics</span>}
          </Link>
        )}
        <Link 
          href="/admin/students" 
          className={`flex items-center gap-3 py-2.5 px-3 transition-all rounded-xl ${
            pathname === "/admin/students" 
              ? "bg-primary/10 text-primary font-bold shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground font-medium"
          } ${isCollapsed ? "justify-center" : ""}`}
          title="Student Directory"
        >
          <Users className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin/students" ? "text-primary" : ""}`} />
          {!isCollapsed && <span>Student Directory</span>}
        </Link>
        
        {isAdmin && (
          <>
            <div className="pt-4 mt-4 border-t border-border/50" />
            
            <Link 
              href="/admin/settings" 
              className={`flex items-center gap-3 py-2.5 px-3 transition-all rounded-xl ${
                pathname === "/admin/settings" 
                  ? "bg-primary/10 text-primary font-bold shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground font-medium"
              } ${isCollapsed ? "justify-center" : ""}`}
              title="System Settings"
            >
              <Settings className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin/settings" ? "text-primary" : ""}`} />
              {!isCollapsed && <span>System Settings</span>}
            </Link>
          </>
        )}
      </nav>

      {/* User profile at bottom of sidebar */}
      <div className={`p-6 border-t flex ${isCollapsed ? "flex-col items-center gap-4" : "items-center justify-between"}`}>
        <div className={`flex ${isCollapsed ? "justify-center" : "items-center gap-3"}`}>
          <ProfileMenu />
          {!isCollapsed && (
            <div className="flex flex-col whitespace-nowrap overflow-hidden">
              <span className="text-sm font-semibold text-foreground truncate">{name}</span>
              <span className="text-xs text-primary font-medium uppercase tracking-wide truncate">{role}</span>
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </motion.aside>
  );
}
