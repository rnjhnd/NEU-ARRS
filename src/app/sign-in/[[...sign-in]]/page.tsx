"use client";

import { useSignIn, useClerk } from "@clerk/nextjs";
import { ArrowLeft, Loader2, KeyRound, Mail } from "lucide-react";
import { LogoIcon } from "@/components/logo-icon";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SignInPage() {
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { signIn } = useSignIn();
  const clerk = useClerk();

  // Handle standard email/password login
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn) return;
    setIsLoading(true);

    try {
      const { error } = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (error) {
        console.error(error);
        toast.error(error.longMessage || error.message || "Sign-in failed. Please verify your credentials.");
        return;
      }

      if (signIn.status === "complete") {
        await signIn.finalize();
        router.push("/");
      } else {
        toast.error("Additional verification is required to complete sign-in.");
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error("An unexpected error occurred during sign-in.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google OAuth login
  const handleGoogleSignIn = async () => {
    if (!signIn) return;
    setIsLoading(true);
    try {
      await clerk.client.signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/",
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'digest' in err && typeof (err as any).digest === 'string' && (err as any).digest.includes("NEXT_REDIRECT")) {
        throw err;
      }
      console.error(err);
      toast.error("An unexpected error occurred. Please try again later.");
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-background overflow-hidden">
      {/* Static Portal Orbs Background (The Sweet Spot) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Portal Base Gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"></div>
        
        {/* Static Blurred Orbs (Matches portal blur-[120px] aesthetic but centralized) */}
        <div className="absolute top-[20%] left-[20%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px] mix-blend-screen"></div>
        <div className="absolute bottom-[20%] right-[20%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] mix-blend-screen"></div>
        <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gold/5 blur-[120px] mix-blend-screen"></div>
        
        {/* Static Corner Orbs (Matches portals exactly) */}
        <div className="absolute -top-[500px] -right-[500px] w-[1000px] h-[1000px] rounded-full bg-primary/5 blur-[120px] opacity-50"></div>
        <div className="absolute -bottom-[500px] -left-[500px] w-[1000px] h-[1000px] rounded-full bg-primary/5 blur-[120px] opacity-50"></div>
      </div>

      {/* Floating Header */}
      <div className="absolute top-4 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-50">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group">
            <div className="p-2 rounded-xl bg-muted/50 group-hover:bg-muted transition-colors border border-border/50">
              <ArrowLeft className="h-4 w-4" />
            </div>
            <span className="hidden sm:inline-block">Back to home</span>
          </Link>
          <div className="flex items-center gap-3 bg-muted/50 p-1.5 rounded-full border border-border/50 backdrop-blur-md">
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md px-4 sm:px-0 animate-in fade-in slide-in-from-bottom-8 duration-700">
        
        {/* Branding Header */}
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="p-3 rounded-2xl bg-primary/10 mb-4 border border-primary/20 shadow-sm">
            <LogoIcon className="h-10 w-10 text-primary dark:text-primary" sealColor="text-yellow-600 dark:text-yellow-500" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            NEU <span className="font-medium text-muted-foreground">ARRS</span>
          </h2>
          <p className="text-muted-foreground mt-2 font-medium text-center">Secure Access Portal</p>
        </div>

        <div className="bg-background/70 backdrop-blur-xl border border-primary/20 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(10,92,54,0.1)] rounded-2xl p-8 space-y-6">
          
          <Button 
            type="button" 
            variant="outline" 
            className="w-full h-12 bg-background hover:bg-muted text-foreground font-medium rounded-xl border-border transition-all shadow-sm active:scale-[0.98]"
            onClick={handleGoogleSignIn}
            disabled={!signIn || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                Please wait...
              </>
            ) : (
              <>
                <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  <path d="M1 1h22v22H1z" fill="none" />
                </svg>
                Continue with Google
              </>
            )}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-transparent px-3 text-muted-foreground font-medium backdrop-blur-md">Or continue with</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">Email address</Label>
              <div className="relative group">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="pl-9 h-11 bg-background/50 border-border/60 text-foreground focus-visible:ring-primary/50 focus-visible:border-primary rounded-xl transition-all shadow-sm"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
              </div>
              <div className="relative group">
                <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 h-11 bg-background/50 border-border/60 text-foreground focus-visible:ring-primary/50 focus-visible:border-primary rounded-xl transition-all shadow-sm"
                  required
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all active:scale-[0.98] shadow-md"
              disabled={!signIn || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="text-center text-sm pt-2">
            <span className="text-muted-foreground">Don&apos;t have an account? </span>
            <Link href="/sign-up" className="font-semibold text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
