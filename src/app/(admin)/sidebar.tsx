"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { GraduationCap, LayoutDashboard, Settings, ChevronLeft, ChevronRight, Users, PieChart, FileText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <motion.aside 
      initial={false}
      animate={{ width: isCollapsed ? 80 : 280 }}
      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
      className="flex-col border-r bg-card hidden md:flex relative overflow-visible z-20"
    >
      <Button
        variant="outline"
        size="icon"
        className="absolute -right-4 top-5 h-8 w-8 rounded-full border bg-background shadow-sm z-50 hover:bg-muted"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>

      <div className="flex h-16 items-center px-6 border-b overflow-hidden whitespace-nowrap">
        <Link href="/admin" className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary flex-shrink-0" />
          {!isCollapsed && (
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-lg font-bold tracking-tight"
            >
              NEU <span className="font-normal text-muted-foreground">Registrar</span>
            </motion.span>
          )}
        </Link>
      </div>
      
      <nav className="flex-1 space-y-1 p-4 overflow-hidden whitespace-nowrap">
        <Link 
          href="/admin" 
          className={`flex items-center gap-3 rounded-md py-2 transition-colors ${
            pathname === "/admin" 
              ? (isCollapsed ? "px-0 justify-center" : "px-3 bg-primary/10 text-primary")
              : (isCollapsed ? "px-0 justify-center text-muted-foreground hover:bg-muted" : "px-3 text-muted-foreground hover:bg-muted")
          }`}
          title="Request Queue"
        >
          <div className={isCollapsed && pathname === "/admin" ? "p-2 rounded-md bg-primary/10 text-primary" : (isCollapsed ? "p-2 rounded-md" : "")}>
            <LayoutDashboard className="w-5 h-5 flex-shrink-0" />
          </div>
          {!isCollapsed && <span>Request Queue</span>}
        </Link>
        <Link 
          href="/admin/documents" 
          className={`flex items-center gap-3 rounded-md py-2 transition-colors ${
            pathname === "/admin/documents" 
              ? (isCollapsed ? "px-0 justify-center" : "px-3 bg-primary/10 text-primary")
              : (isCollapsed ? "px-0 justify-center text-muted-foreground hover:bg-muted" : "px-3 text-muted-foreground hover:bg-muted")
          }`}
          title="Document Management"
        >
          <div className={isCollapsed && pathname === "/admin/documents" ? "p-2 rounded-md bg-primary/10 text-primary" : (isCollapsed ? "p-2 rounded-md" : "")}>
            <FileText className="w-5 h-5 flex-shrink-0" />
          </div>
          {!isCollapsed && <span>Document Management</span>}
        </Link>
        <Link 
          href="/admin/finance" 
          className={`flex items-center gap-3 rounded-md py-2 transition-colors ${
            pathname === "/admin/finance" 
              ? (isCollapsed ? "px-0 justify-center" : "px-3 bg-primary/10 text-primary")
              : (isCollapsed ? "px-0 justify-center text-muted-foreground hover:bg-muted" : "px-3 text-muted-foreground hover:bg-muted")
          }`}
          title="Financial Analytics"
        >
          <div className={isCollapsed && pathname === "/admin/finance" ? "p-2 rounded-md bg-primary/10 text-primary" : (isCollapsed ? "p-2 rounded-md" : "")}>
            <PieChart className="w-5 h-5 flex-shrink-0" />
          </div>
          {!isCollapsed && <span>Financial Analytics</span>}
        </Link>
        <Link 
          href="/admin/students" 
          className={`flex items-center gap-3 rounded-md py-2 transition-colors ${
            pathname === "/admin/students" 
              ? (isCollapsed ? "px-0 justify-center" : "px-3 bg-primary/10 text-primary")
              : (isCollapsed ? "px-0 justify-center text-muted-foreground hover:bg-muted" : "px-3 text-muted-foreground hover:bg-muted")
          }`}
          title="Student Directory"
        >
          <div className={isCollapsed && pathname === "/admin/students" ? "p-2 rounded-md bg-primary/10 text-primary" : (isCollapsed ? "p-2 rounded-md" : "")}>
            <Users className="w-5 h-5 flex-shrink-0" />
          </div>
          {!isCollapsed && <span>Student Directory</span>}
        </Link>
        <div className="pt-4 mt-4 border-t border-border/50" />
        <Link 
          href="/admin/settings" 
          className={`flex items-center gap-3 rounded-md py-2 transition-colors ${
            pathname === "/admin/settings" 
              ? (isCollapsed ? "px-0 justify-center" : "px-3 bg-primary/10 text-primary")
              : (isCollapsed ? "px-0 justify-center text-muted-foreground hover:bg-muted" : "px-3 text-muted-foreground hover:bg-muted")
          }`}
          title="Admin Settings"
        >
          <div className={isCollapsed && pathname === "/admin/settings" ? "p-2 rounded-md bg-primary/10 text-primary" : (isCollapsed ? "p-2 rounded-md" : "")}>
            <Settings className="w-5 h-5 flex-shrink-0" />
          </div>
          {!isCollapsed && <span>Admin Settings</span>}
        </Link>
      </nav>

      {/* User profile at bottom of sidebar */}
      <div className={`p-4 border-t flex ${isCollapsed ? "justify-center" : "items-center gap-3"}`}>
        <UserButton />
        {!isCollapsed && (
          <div className="flex flex-col whitespace-nowrap overflow-hidden">
            <span className="text-sm font-semibold truncate">Administrator</span>
            <span className="text-xs text-muted-foreground truncate">Registrar Office</span>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
