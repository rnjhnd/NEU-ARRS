"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";
import { LogoIcon } from "@/components/logo-icon";
import { ProfileMenu } from "@/components/profile-menu";
import { ProfileDetails } from "@/components/profile-details";
import { useProfileIdentity } from "@/components/use-profile-identity";
import type { ServerUser } from "@/lib/profile-identity";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { AdminNavLinks } from "./admin-nav-links";

export function Sidebar({ serverUser }: { serverUser?: ServerUser }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { profile } = useProfileIdentity(serverUser);

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
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!isCollapsed}
        className="absolute -right-4 top-[36px] h-8 w-8 rounded-full border border-border/50 bg-background/80 backdrop-blur-md text-foreground shadow-sm z-50 hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-md hover:scale-110 transition-all duration-300"
        onClick={() => setIsCollapsed(collapsed => !collapsed)}
      >
        <motion.div animate={{ rotate: isCollapsed ? 180 : 0 }} transition={{ type: "spring", bounce: 0, duration: 0.4 }}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        </motion.div>
      </Button>

      <div className="flex pt-8 pb-6 items-start px-6 border-b border-primary/10 overflow-hidden whitespace-nowrap">
        <Link href="/admin" aria-label="NEU ARRS command center" className="flex items-center gap-2 group transition-all duration-300">
          <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <LogoIcon className="h-5 w-5 text-primary flex-shrink-0" sealColor="text-yellow-600 dark:text-yellow-500" />
          </div>
          {!isCollapsed && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-lg font-bold tracking-tight">
              NEU <span className="font-normal text-muted-foreground">ARRS</span>
            </motion.span>
          )}
        </Link>
      </div>

      <AdminNavLinks role={profile?.role} collapsed={isCollapsed} />

      <div className={cn("p-6 border-t border-primary/10 bg-muted/20 flex",
        isCollapsed ? "flex-col items-center gap-4" : "items-center justify-between")}>
        <div className={cn("flex", isCollapsed ? "justify-center" : "items-center gap-3")}>
          <ProfileMenu side="top" serverUser={serverUser} />
          {!isCollapsed && <ProfileDetails serverUser={serverUser} />}
        </div>
        <div className="flex-shrink-0"><ThemeToggle /></div>
      </div>
    </motion.aside>
  );
}
