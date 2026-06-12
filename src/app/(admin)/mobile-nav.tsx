"use client";

import { useState } from "react";
import { Menu, X, FileBadge, LayoutDashboard, Settings, Users, PieChart, FileText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProfileMenu } from "@/components/profile-menu";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsOpen(true)}>
        <Menu className="w-5 h-5" />
      </Button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden"
            />
            
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-3/4 max-w-sm bg-card border-r shadow-2xl flex flex-col md:hidden"
            >
              <div className="flex h-16 items-center justify-between px-6 border-b">
                <Link href="/admin" className="flex items-center gap-2" onClick={() => setIsOpen(false)}>
                  <FileBadge className="h-6 w-6 text-primary" />
                  <span className="font-bold text-xl tracking-tight ml-2">
                    NEU <span className="font-normal text-muted-foreground">ARRS</span>
                  </span>
                </Link>
                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              <nav className="flex-1 space-y-2 p-4">
                <Link 
                  href="/admin" 
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors ${pathname === "/admin" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  <LayoutDashboard className="w-5 h-5" />
                  Request Queue
                </Link>
                <Link 
                  href="/admin/documents" 
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors ${pathname === "/admin/documents" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  <FileText className="w-5 h-5" />
                  Document Management
                </Link>
                <Link 
                  href="/admin/finance" 
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors ${pathname === "/admin/finance" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  <PieChart className="w-5 h-5" />
                  Financial Analytics
                </Link>
                <Link 
                  href="/admin/students" 
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors ${pathname === "/admin/students" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  <Users className="w-5 h-5" />
                  Student Directory
                </Link>
                <div className="pt-2 mt-2 border-t border-border/50" />
                <Link 
                  href="/admin/settings" 
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors ${pathname === "/admin/settings" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  <Settings className="w-5 h-5" />
                  Admin Settings
                </Link>
              </nav>

              <div className="p-6 border-t mt-auto">
                <div className="flex items-center gap-3">
                  <ProfileMenu />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">Administrator</span>
                    <span className="text-xs text-muted-foreground">Registrar Office</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
