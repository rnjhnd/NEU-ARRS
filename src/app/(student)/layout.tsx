import { UserButton } from "@clerk/nextjs";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-6 md:px-12 max-w-7xl mx-auto w-full">
          <Link href="/dashboard" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <GraduationCap className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold tracking-tight">
              NEU <span className="text-muted-foreground font-normal">Portal</span>
            </span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link 
              href="/dashboard" 
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
            >
              Dashboard
            </Link>
            <div className="h-5 w-px bg-border hidden sm:block"></div>
            <ThemeToggle />
            <UserButton />
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 md:px-12 py-8">
        {children}
      </main>
    </div>
  );
}
