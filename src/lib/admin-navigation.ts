import type { DisplayRole } from "./profile-identity";

const routes = [
  { href: "/admin", label: "Command Center", icon: "dashboard", adminOnly: false },
  { href: "/admin/documents", label: "Document Management", icon: "documents", adminOnly: true },
  { href: "/admin/finance", label: "Financial Analytics", icon: "finance", adminOnly: true },
  { href: "/admin/students", label: "Student Directory", icon: "students", adminOnly: false },
  { href: "/admin/settings", label: "System Settings", icon: "settings", adminOnly: true },
] as const;

export function adminNavigation(role: DisplayRole | undefined) {
  if (role !== "admin" && role !== "employee") return [];
  return routes.filter(route => !route.adminOnly || role === "admin");
}

export function isNavigationActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  const paths = href === "/admin/settings" ? [href, "/admin/notifications"] : [href];
  return paths.some(path => pathname === path || pathname.startsWith(path + "/"));
}
