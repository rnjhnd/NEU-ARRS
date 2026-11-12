"use client";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
export default function PageError({ retry }: { error: unknown; retry: () => void }) {
  const { signOut } = useClerk();
  return <main className="mx-auto max-w-xl space-y-4 p-8"><h1 className="text-2xl font-bold">This page could not be verified</h1><p>Account access may have changed, or a service may be unavailable. Retry the page. If access remains restricted, sign in again or contact the registrar.</p><div className="flex flex-wrap gap-3"><Button onClick={retry}>Retry page</Button><Button variant="outline" onClick={() => void signOut({ redirectUrl: "/sign-in" }).catch(() => {})}>Sign out</Button></div></main>;
}
