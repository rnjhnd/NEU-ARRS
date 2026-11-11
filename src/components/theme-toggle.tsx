"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/50 hover:bg-slate-100 dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10 transition-colors shadow-sm"
      aria-label="Toggle theme"
    >
      <Sun aria-hidden="true" className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-gold" />
      <Moon aria-hidden="true" className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-slate-200 drop-shadow-[0_0_5px_rgba(226,232,240,0.5)]" />
    </button>
  );
}
