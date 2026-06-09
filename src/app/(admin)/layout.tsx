import { ThemeToggle } from "@/components/theme-toggle";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar />

      {/* Admin Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex h-16 items-center justify-between px-4 md:px-8 border-b bg-background">
          <div className="flex items-center gap-3">
            <MobileNav />
            <h1 className="text-xl font-bold tracking-tight">Admin Dashboard</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <ThemeToggle />
          </div>
        </header>
        
        <main className="flex-1 p-8 overflow-y-auto bg-muted/20">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
