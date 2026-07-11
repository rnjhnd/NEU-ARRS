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
      className="flex-col hidden xl:flex relative z-20 h-[calc(100vh-2rem)] my-4 ml-4 rounded-[2rem] border border-primary/20 bg-background/70 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgba(10,92,54,0.1)] overflow-visible supports-[backdrop-filter]:bg-background/40"
    >
      <Button
        variant="outline"
        size="icon"
        className="absolute -right-4 top-[36px] h-8 w-8 rounded-full border border-border/50 bg-background/80 backdrop-blur-md text-foreground shadow-sm z-50 hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-md hover:scale-110 transition-all duration-300"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <motion.div animate={{ rotate: isCollapsed ? 180 : 0 }} transition={{ type: "spring", bounce: 0, duration: 0.4 }}>
          <ChevronLeft className="h-4 w-4" />
        </motion.div>
      </Button>

      <div className="flex pt-8 pb-6 items-start px-6 border-b border-primary/10 overflow-hidden whitespace-nowrap">
        <Link href="/admin" className="flex items-center gap-2 group transition-all duration-300">
          <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <LogoIcon className="h-5 w-5 text-primary flex-shrink-0" sealColor="text-yellow-600 dark:text-yellow-500" />
          </div>
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
      
      <nav className="flex-1 space-y-2 p-4 overflow-y-auto overflow-x-hidden no-scrollbar whitespace-nowrap">
        <Link 
          href="/admin" 
          className={`flex items-center gap-3 py-2.5 px-3 transition-all duration-300 rounded-xl ${
            pathname === "/admin" 
              ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-bold shadow-sm border border-primary/10"
              : "text-muted-foreground hover:bg-primary/5 hover:text-foreground font-medium border border-transparent"
          } ${isCollapsed ? "justify-center" : ""}`}
          title="Command Center"
        >
          <LayoutDashboard className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin" ? "text-primary" : ""}`} />
          {!isCollapsed && <span>Command Center</span>}
        </Link>
        {isAdmin && (
          <Link 
            href="/admin/documents" 
            className={`flex items-center gap-3 py-2.5 px-3 transition-all duration-300 rounded-xl ${
              pathname === "/admin/documents" 
                ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-bold shadow-sm border border-primary/10"
                : "text-muted-foreground hover:bg-primary/5 hover:text-foreground font-medium border border-transparent"
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
            className={`flex items-center gap-3 py-2.5 px-3 transition-all duration-300 rounded-xl ${
              pathname === "/admin/finance" 
                ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-bold shadow-sm border border-primary/10"
                : "text-muted-foreground hover:bg-primary/5 hover:text-foreground font-medium border border-transparent"
            } ${isCollapsed ? "justify-center" : ""}`}
            title="Financial Analytics"
          >
            <PieChart className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin/finance" ? "text-primary" : ""}`} />
            {!isCollapsed && <span>Financial Analytics</span>}
          </Link>
        )}
        <Link 
          href="/admin/students" 
          className={`flex items-center gap-3 py-2.5 px-3 transition-all duration-300 rounded-xl ${
            pathname === "/admin/students" 
              ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-bold shadow-sm border border-primary/10"
              : "text-muted-foreground hover:bg-primary/5 hover:text-foreground font-medium border border-transparent"
          } ${isCollapsed ? "justify-center" : ""}`}
          title="Student Directory"
        >
          <Users className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin/students" ? "text-primary" : ""}`} />
          {!isCollapsed && <span>Student Directory</span>}
        </Link>
        
        {isAdmin && (
          <>
            <div className="pt-4 mt-4 border-t border-primary/10 mx-2" />
            
            <Link 
              href="/admin/settings" 
              className={`flex items-center gap-3 py-2.5 px-3 transition-all duration-300 rounded-xl ${
                pathname === "/admin/settings" 
                  ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-bold shadow-sm border border-primary/10"
                  : "text-muted-foreground hover:bg-primary/5 hover:text-foreground font-medium border border-transparent"
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
      <div className={`p-6 border-t border-primary/10 bg-muted/20 flex ${isCollapsed ? "flex-col items-center gap-4" : "items-center justify-between"}`}>
        <div className={`flex ${isCollapsed ? "justify-center" : "items-center gap-3"}`}>
          <ProfileMenu side="top" />
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
