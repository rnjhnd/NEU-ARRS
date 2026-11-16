"use client";
import { useState } from "react";
import Link from "next/link";
import { NavigationPending } from "@/components/navigation-pending";
import { ProfileMenu } from "@/components/profile-menu";

export function WorkspaceChrome({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  return <div className="p-6">
    <header className="flex items-center gap-4 border p-4">
      <button onClick={() => setCollapsed(value => !value)}>{collapsed ? "Expand sidebar" : "Collapse sidebar"}</button>
      <Link href="/dashboard" prefetch={false}>Overview <NavigationPending /></Link>
      <Link href="/dashboard/reports" prefetch={false}>Reports <NavigationPending /></Link>
      <ProfileMenu />
    </header>
    <main className="p-6">{children}</main>
  </div>;
}
