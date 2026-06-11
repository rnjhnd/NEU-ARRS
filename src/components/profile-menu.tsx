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
      <DropdownMenuTrigger className="relative h-8 w-8 rounded-full shadow-sm ring-2 ring-emerald-500 hover:ring-emerald-600 dark:hover:ring-emerald-400 focus:outline-none active:scale-95 transition-all">
          <Avatar className="h-full w-full">
            <AvatarImage src={user.imageUrl} alt={name} />
            <AvatarFallback className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
              {fallbackInitials}
            </AvatarFallback>
          </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="w-64 p-2 rounded-3xl bg-background/90 backdrop-blur-2xl border border-border/50 shadow-2xl z-50 mb-2" 
        align="end"
        side="top"
        sideOffset={12}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal p-2">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 shadow-sm border border-border/30">
                <AvatarImage src={user.imageUrl} alt={name} />
                <AvatarFallback className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                  {fallbackInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold leading-none text-foreground truncate max-w-[150px]">{name}</p>
                <p className="text-[11px] font-medium leading-none text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                  {isAdmin ? "Administrator" : "Student"}
                </p>
                <p className="text-xs text-muted-foreground truncate max-w-[150px]">{email}</p>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-border/40 my-1.5 mx-2" />
        <DropdownMenuGroup>
          <DropdownMenuItem 
            className="cursor-pointer py-2.5 px-3 rounded-xl focus:bg-emerald-500/10 focus:text-emerald-600 dark:focus:text-emerald-400 transition-colors group"
            onClick={() => window.location.href = "mailto:support@neu.edu.ph"}
          >
            <LifeBuoy className="mr-3 h-4 w-4 text-muted-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
            <span className="font-medium">Help & Support</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-border/40 my-1.5 mx-2" />
        <DropdownMenuItem 
          className="cursor-pointer py-2.5 px-3 rounded-xl text-red-600 focus:bg-red-500/10 focus:text-red-600 transition-colors group"
          onClick={handleSignOut}
        >
          <LogOut className="mr-3 h-4 w-4 text-red-500/70 group-hover:text-red-600 transition-colors" />
          <span className="font-medium">Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
