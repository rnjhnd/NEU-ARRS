"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import React from "react";

export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  return (
    <ClerkProvider
      appearance={{
        baseTheme: resolvedTheme === "dark" ? dark : undefined,
        variables: { 
          colorPrimary: "#10b981",
          borderRadius: "0.75rem",
        },
        elements: { 
          watermark: "hidden",
          cardBox: "shadow-xl border border-border/50",
          card: "bg-background",
          navbar: "border-r border-border/50",
          scrollBox: "bg-background",
          pageScrollBox: "bg-background",
          navbarButton: "text-muted-foreground hover:text-foreground",
          navbarButton__active: "text-emerald-500 bg-emerald-500/10",
        }
      }}
    >
      {children}
    </ClerkProvider>
  );
}
