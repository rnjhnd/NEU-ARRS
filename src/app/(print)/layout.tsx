import { ReactNode } from "react";

export default function PrintLayout({ children }: { children: ReactNode }) {
  // This layout intentionally omits headers, sidebars, and navigation
  // to ensure a clean, printable page.
  return (
    <div className="min-h-screen bg-white">
      {children}
    </div>
  );
}
