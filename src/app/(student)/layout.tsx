import { ProfileMenu } from "@/components/profile-menu";
import { LogoIcon } from "@/components/logo-icon";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { currentUser } from "@clerk/nextjs/server";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const name = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User" : "Student";
  const rawRole = user?.publicMetadata?.role as string | undefined;
  const roleName = rawRole === "admin" ? "Administrator" : rawRole === "employee" ? "Employee" : "Student";
  const serverUser = user ? {
    name,
    email: user.primaryEmailAddress?.emailAddress || "",
    imageUrl: user.imageUrl,
    role: rawRole as string
  } : null;
  
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background overflow-hidden">
      {/* Animated Background Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute -top-[500px] -right-[500px] w-[1000px] h-[1000px] rounded-full bg-primary/5 blur-[120px] opacity-50"></div>
        <div className="absolute -bottom-[500px] -left-[500px] w-[1000px] h-[1000px] rounded-full bg-primary/5 blur-[120px] opacity-50"></div>
      </div>

      {/* Floating Glassmorphic Header */}
      <header className="sticky top-4 z-50 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
        <div className="relative flex h-16 items-center justify-between px-6 rounded-2xl bg-background/70 backdrop-blur-xl border border-primary/20 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(10,92,54,0.1)] transition-all supports-[backdrop-filter]:bg-background/40">
          <Link href="/dashboard" className="flex items-center gap-2 group transition-all duration-300">
            <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <LogoIcon className="h-5 w-5 text-primary dark:text-primary" sealColor="text-yellow-600 dark:text-yellow-500" />
            </div>
            <span className="font-bold text-xl tracking-tight ml-2">
              NEU <span className="font-normal text-muted-foreground">ARRS</span>
            </span>
          </Link>

          <nav className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2 bg-muted/50 p-1.5 pl-4 rounded-full border border-border/50">
              <ThemeToggle />
              <div className="flex items-center gap-3 pr-1.5 pl-2 ml-1 border-l border-border/50">
                <div className="flex flex-col whitespace-nowrap overflow-hidden hidden sm:flex">
                  <span className="text-sm font-semibold text-foreground truncate leading-tight">{name}</span>
                  <span className="text-[11px] text-primary font-medium uppercase tracking-wide truncate leading-tight">{roleName}</span>
                </div>
                <ProfileMenu serverUser={serverUser} />
              </div>
            </div>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
          {children}
        </div>
      </main>
    </div>
  );
}
