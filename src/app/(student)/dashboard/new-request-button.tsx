"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export function NewRequestButton({ 
  isMaintenanceMode, 
  className,
  size = "lg",
  children
}: { 
  isMaintenanceMode: boolean;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  children: React.ReactNode;
}) {
  if (isMaintenanceMode) {
    return (
      <div className="shrink-0">
        <Button 
          size={size}
          className={`${className} opacity-90`}
          onClick={() => toast.error("System is currently under maintenance. New requests cannot be created at this time.")}
        >
          {children}
        </Button>
      </div>
    );
  }

  return (
    <Link href="/dashboard/new" className="shrink-0">
      <Button size={size} className={className}>
        {children}
      </Button>
    </Link>
  );
}
