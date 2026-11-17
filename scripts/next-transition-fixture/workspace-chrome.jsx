"use client";
import { useState } from "react";
import Link from "next/link";
import { ProfileMenu } from "@/components/profile-menu";
import { AdminNavLinks } from "@/app/(admin)/admin-nav-links";
import { useUser } from "@clerk/nextjs";

export function WorkspaceChrome({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useUser();
  return <div className="p-6">
    <header className="flex items-center gap-4 border p-4">
      <button onClick={() => setCollapsed(value => !value)}>{collapsed ? "Expand sidebar" : "Collapse sidebar"}</button>
      {user?.publicMetadata.role === "student" ? <><Link href="/dashboard">Overview</Link><Link href="/dashboard/new">New request</Link></> : <AdminNavLinks role={user?.publicMetadata.role} collapsed={collapsed} />}
      <ProfileMenu />
    </header>
    <main className="p-6">{children}</main>
  </div>;
}
