"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
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
import { useProfileIdentity } from "./use-profile-identity";
import { roleLabel, type ServerUser } from "@/lib/profile-identity";

export function ProfileMenu({ side = "bottom", serverUser }: {
  side?: "top" | "bottom" | "left" | "right";
  serverUser?: ServerUser;
} = {}) {
  const { profile, loading } = useProfileIdentity(serverUser);
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <Skeleton className="h-8 w-8 rounded-full" />;
  if (!profile) return null;

  const initials = profile.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  async function handleSignOut() {
    if (pending) return;
    setPending(true);
    setError(null);
    try { await signOut({ redirectUrl: "/" }); }
    catch { setError("Sign-out could not be confirmed. Please try again."); }
    finally { setPending(false); }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={"Open profile menu for " + profile.name}
        className="relative h-8 w-8 rounded-full shadow-sm ring-2 ring-primary/50 ring-offset-2 ring-offset-background hover:ring-primary focus-visible:outline-none focus-visible:ring-4 active:scale-95 transition-all">
        <Avatar className="h-full w-full">
          <AvatarImage src={profile.imageUrl} alt="" />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 p-2 rounded-3xl bg-popover border border-border/50 shadow-2xl z-[200]"
        align="end" side={side} sideOffset={12}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal p-2">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 shadow-sm ring-2 ring-primary/50 ring-offset-2 ring-offset-popover">
                <AvatarImage src={profile.imageUrl} alt="" />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold leading-none text-popover-foreground truncate max-w-[150px]">{profile.name}</p>
                <p className="text-[11px] font-medium leading-none text-primary uppercase tracking-wide">{roleLabel(profile.role)}</p>
                <p className="text-xs text-muted-foreground truncate max-w-[150px]" title={profile.email}>{profile.email}</p>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-border/40 my-1.5 mx-2" />
        <DropdownMenuGroup>
          <DropdownMenuItem className="cursor-pointer py-2.5 px-3 rounded-xl"
            render={<a href="mailto:support@neu.edu.ph" />}>
            <LifeBuoy aria-hidden="true" className="mr-3 h-4 w-4" />
            <span className="font-medium">Help & Support</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-border/40 my-1.5 mx-2" />
        <DropdownMenuItem variant="destructive" disabled={pending} closeOnClick={false}
          className="cursor-pointer py-2.5 px-3 rounded-xl focus:bg-red-500/10 transition-colors group"
          onClick={handleSignOut}>
          <LogOut aria-hidden="true" className="mr-3 h-4 w-4 text-red-500/70 group-hover:text-red-600 transition-colors" />
          <span className="font-medium">{pending ? "Signing out..." : "Log out"}</span>
        </DropdownMenuItem>
        {error && <p role="alert" className="px-3 py-2 text-sm text-destructive">{error}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
