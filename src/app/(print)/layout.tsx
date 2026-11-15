import { ReactNode } from "react";
import { SessionPage } from "@/components/session-guard";

export default function PrintLayout({ children }: { children: ReactNode }) {
  // This layout intentionally omits headers, sidebars, and navigation
  // to ensure a clean, printable page.
  return (
    <div className="min-h-screen bg-white">
      <SessionPage>{children}</SessionPage>
    </div>
  );
}
