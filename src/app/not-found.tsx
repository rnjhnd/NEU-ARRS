import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-center px-4">
      <div className="space-y-6 max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mx-auto w-fit p-4 bg-muted/50 rounded-full border border-border text-muted-foreground">
          <FileQuestion className="h-12 w-12" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">404</h1>
          <h2 className="text-xl font-semibold text-foreground">Page Not Found</h2>
          <p className="text-muted-foreground">
            We couldn&apos;t find the page you were looking for. It might have been moved, deleted, or perhaps the URL is incorrect.
          </p>
        </div>

        <div className="pt-4">
          <Link href="/">
            <Button size="lg" className="w-full sm:w-auto shadow-sm">
              <Home className="mr-2 h-4 w-4" /> Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
