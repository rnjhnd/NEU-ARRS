import { ThemeToggle } from "@/components/theme-toggle";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-slate-50/50 dark:bg-background overflow-hidden relative">
      {/* Animated Background Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute -top-[500px] -right-[500px] w-[1000px] h-[1000px] rounded-full bg-primary/5 blur-[120px] opacity-50"></div>
        <div className="absolute -bottom-[500px] -left-[500px] w-[1000px] h-[1000px] rounded-full bg-primary/5 blur-[120px] opacity-50"></div>
      </div>

      <div className="relative z-10 flex h-full w-full pointer-events-auto">
        <Sidebar />

        {/* Admin Main Content */}
        <div className="flex-1 flex flex-col min-w-0 h-full">
          {/* Mobile Header (Hidden on Desktop) */}
          <div className="md:hidden p-4 pb-0">
            <header className="flex h-14 shrink-0 items-center justify-between px-4 rounded-xl bg-background/60 backdrop-blur-xl border border-primary/10 shadow-sm supports-[backdrop-filter]:bg-background/40">
              <div className="flex items-center gap-3">
                <MobileNav />
                <span className="font-bold text-xl tracking-tight ml-2">
                  NEU <span className="font-medium text-primary dark:text-primary">ARRS</span>
                </span>
              </div>
              <ThemeToggle />
            </header>
          </div>
          
          <main className="flex-1 p-4 md:p-6 overflow-y-auto">
            <div className="max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
