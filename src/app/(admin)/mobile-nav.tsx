"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Menu, X, LayoutDashboard, Settings, Users, PieChart, FileText } from "lucide-react";
import { LogoIcon } from "@/components/logo-icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProfileMenu } from "@/components/profile-menu";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { useUser } from "@clerk/nextjs";

export function MobileNav({ serverRole }: { serverRole: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useUser();
  const isAdmin = serverRole === "admin";
  const cachedNameRef = useRef<string | null>(null);
  
  if (user) {
    cachedNameRef.current = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User";
  }
  
  const name = cachedNameRef.current;
  const roleName = serverRole === "admin" ? "Administrator" : serverRole === "employee" ? "Employee" : "Student";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <Button variant="ghost" size="icon" className="xl:hidden" onClick={() => setIsOpen(true)}>
        <Menu className="w-5 h-5" />
      </Button>

      {mounted && createPortal(
        <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm xl:hidden"
            />
            
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-3/4 max-w-sm bg-card border-r shadow-2xl flex flex-col xl:hidden"
            >
              <div className="flex h-16 items-center justify-between px-6 border-b">
                <Link href="/admin" className="flex items-center gap-2 group transition-all duration-300" onClick={() => setIsOpen(false)}>
                  <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <LogoIcon className="h-5 w-5 text-primary flex-shrink-0" sealColor="text-yellow-600 dark:text-yellow-500" />
                  </div>
                  <span className="font-bold text-xl tracking-tight ml-2 truncate">
                    NEU <span className="font-normal text-muted-foreground">ARRS</span>
                  </span>
                </Link>
                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              <nav className="flex-1 space-y-2 p-4 overflow-y-auto no-scrollbar">
                <Link 
                  href="/admin" 
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 py-2.5 px-3 transition-all duration-300 rounded-xl ${
                    pathname === "/admin" 
                      ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-bold shadow-sm border border-primary/10"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-foreground font-medium border border-transparent"
                  }`}
                >
                  <LayoutDashboard className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin" ? "text-primary" : ""}`} />
                  Command Center
                </Link>
                {isAdmin && (
                  <Link 
                    href="/admin/documents" 
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 py-2.5 px-3 transition-all duration-300 rounded-xl ${
                      pathname === "/admin/documents" 
                        ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-bold shadow-sm border border-primary/10"
                        : "text-muted-foreground hover:bg-primary/5 hover:text-foreground font-medium border border-transparent"
                    }`}
                  >
                    <FileText className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin/documents" ? "text-primary" : ""}`} />
                    Document Management
                  </Link>
                )}
                {isAdmin && (
                  <Link 
                    href="/admin/finance" 
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 py-2.5 px-3 transition-all duration-300 rounded-xl ${
                      pathname === "/admin/finance" 
                        ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-bold shadow-sm border border-primary/10"
                        : "text-muted-foreground hover:bg-primary/5 hover:text-foreground font-medium border border-transparent"
                    }`}
                  >
                    <PieChart className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin/finance" ? "text-primary" : ""}`} />
                    Financial Analytics
                  </Link>
                )}
                <Link 
                  href="/admin/students" 
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 py-2.5 px-3 transition-all duration-300 rounded-xl ${
                    pathname === "/admin/students" 
                      ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-bold shadow-sm border border-primary/10"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-foreground font-medium border border-transparent"
                  }`}
                >
                  <Users className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin/students" ? "text-primary" : ""}`} />
                  Student Directory
                </Link>
                {isAdmin && (
                  <>
                    <div className="pt-2 mt-2 border-t border-border/50" />
                    <Link 
                      href="/admin/settings" 
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-3 py-2.5 px-3 transition-all duration-300 rounded-xl ${
                        pathname === "/admin/settings" 
                          ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-bold shadow-sm border border-primary/10"
                          : "text-muted-foreground hover:bg-primary/5 hover:text-foreground font-medium border border-transparent"
                      }`}
                    >
                      <Settings className={`w-5 h-5 flex-shrink-0 transition-colors ${pathname === "/admin/settings" ? "text-primary" : ""}`} />
                      System Settings
                    </Link>
                  </>
                )}
              </nav>

              <div className="p-6 border-t mt-auto">
                <div className="flex items-center gap-3">
                  <ProfileMenu side="top" />
                  <div className="flex flex-col whitespace-nowrap overflow-hidden">
                    <span className="text-sm font-semibold truncate">
                      {name || <Skeleton className="h-4 w-24 mb-1" />}
                    </span>
                    <span className="text-xs text-primary font-medium uppercase tracking-wide truncate">
                      {name ? roleName : <Skeleton className="h-3 w-16" />}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      , document.body)}
    </>
  );
}
