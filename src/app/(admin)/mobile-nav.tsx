"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";
import { LogoIcon } from "@/components/logo-icon";
import { ProfileMenu } from "@/components/profile-menu";
import { ProfileDetails } from "@/components/profile-details";
import { useProfileIdentity } from "@/components/use-profile-identity";
import type { DisplayRole, ServerUser } from "@/lib/profile-identity";
import { Button } from "@/components/ui/button";
import { AdminNavLinks } from "./admin-nav-links";
import { useDesktopNavigation } from "./use-desktop-navigation";

export function MobileNav({ serverUser }: { serverUser?: ServerUser }) {
  const pathname = usePathname();
  const desktop = useDesktopNavigation();
  const { profile } = useProfileIdentity(serverUser);
  // Route, account and breakpoint changes discard open state and modal locks.
  return <MobileDrawer key={pathname + ":" + desktop + ":" + (profile?.id ?? "anonymous")}
    desktop={desktop} role={profile?.role} serverUser={serverUser} />;
}

function MobileDrawer({ desktop, role, serverUser }: { desktop: boolean; role?: DisplayRole; serverUser?: ServerUser }) {
  const [open, setOpen] = useState(false);
  if (desktop) return null;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger render={<Button variant="ghost" size="icon" className="xl:hidden" />} aria-label="Open navigation">
        <Menu aria-hidden="true" className="w-5 h-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm xl:hidden transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup className="fixed inset-y-0 left-0 z-50 w-3/4 max-w-sm bg-card border-r shadow-2xl flex flex-col xl:hidden outline-none transition-transform duration-200 data-starting-style:-translate-x-full data-ending-style:-translate-x-full motion-reduce:transition-none">
          <Dialog.Title className="sr-only">Staff navigation</Dialog.Title>
          <Dialog.Description className="sr-only">Choose a registrar workspace.</Dialog.Description>
          <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b">
            <Link href="/admin" className="flex items-center gap-2 group" onNavigate={() => setOpen(false)}>
              <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <LogoIcon className="h-5 w-5 text-primary flex-shrink-0" sealColor="text-yellow-600 dark:text-yellow-500" />
              </div>
              <span className="font-bold text-xl tracking-tight ml-2 truncate">
                NEU <span className="font-normal text-muted-foreground">ARRS</span>
              </span>
            </Link>
            <Dialog.Close render={<Button variant="ghost" size="icon" />} aria-label="Close navigation">
              <X aria-hidden="true" className="w-5 h-5" />
            </Dialog.Close>
          </div>
          <AdminNavLinks role={role} onNavigate={() => setOpen(false)} />
          <div className="p-6 border-t mt-auto flex items-center gap-3">
            <ProfileMenu side="top" serverUser={serverUser} />
            <ProfileDetails serverUser={serverUser} />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
