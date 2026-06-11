"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { LogOut, LifeBuoy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";

export function ProfileMenu() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

  if (!isLoaded) {
    return <Skeleton className="h-8 w-8 rounded-full" />;
  }

  if (!user) {
    return null;
  }

  const role = user.publicMetadata?.role as string | undefined;
  const isAdmin = role === "admin";
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User";
  const email = user.primaryEmailAddress?.emailAddress || "";
  const fallbackInitials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const handleSignOut = () => {
    signOut(() => router.push("/"));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative h-8 w-8 rounded-full shadow-sm ring-2 ring-emerald-500 hover:ring-emerald-600 dark:hover:ring-emerald-400 focus:outline-none transition-all">
          <Avatar className="h-full w-full">
            <AvatarImage src={user.imageUrl} alt={name} />
            <AvatarFallback className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
              {fallbackInitials}
            </AvatarFallback>
          </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="w-56 rounded-2xl bg-background/80 backdrop-blur-xl border border-border shadow-xl z-50 mb-2" 
        align="end"
        side="top"
        sideOffset={8}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1 p-1">
              <p className="text-sm font-semibold leading-none text-foreground">{name}</p>
              <p className="text-xs leading-none text-muted-foreground truncate">{email}</p>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-border/50" />
        <DropdownMenuGroup>
          <DropdownMenuItem 
            className="cursor-pointer rounded-xl focus:bg-emerald-500/10 focus:text-emerald-600 dark:focus:text-emerald-400 transition-colors"
            onClick={() => window.location.href = "mailto:support@neu.edu.ph"}
          >
            <LifeBuoy className="mr-2 h-4 w-4" />
            <span>Help & Support</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-border/50" />
        <DropdownMenuItem 
          className="cursor-pointer rounded-xl text-red-600 focus:bg-red-500/10 focus:text-red-600 transition-colors"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
