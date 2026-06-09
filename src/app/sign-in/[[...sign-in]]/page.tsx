"use client";

import { useSignIn } from "@clerk/nextjs";
import { GraduationCap, ArrowLeft, CheckCircle2, Loader2, KeyRound, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Handle standard email/password login
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setIsLoading(true);

    try {
      const result = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/");
      } else {
        console.error(result);
        toast.error("Sign in failed. Please check your credentials.");
      }
    } catch (err: unknown) {
      console.error(err);
      const error = err as { errors?: { longMessage?: string }[] };
      toast.error(error.errors?.[0]?.longMessage || "An error occurred during sign in.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google OAuth login
  const handleGoogleSignIn = async () => {
    if (!isLoaded) return;
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/",
      });
    } catch (err: unknown) {
      console.error(err);
      const error = err as { errors?: { longMessage?: string }[] };
      toast.error(error.errors?.[0]?.longMessage || "Failed to authenticate with Google.");
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left side: Branding / UI (Vibrant animated green gradient) */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] p-12 relative overflow-hidden text-white shadow-2xl z-10">
        <div className="absolute inset-0 bg-[#0A5C36]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#34d399]/40 via-[#0A5C36]/0 to-[#042F1A]/80 animate-pulse" style={{ animationDuration: '4s' }}></div>
        
        <Link href="/" className="flex items-center gap-2 z-10 w-fit hover:opacity-80 transition-opacity">
          <GraduationCap className="h-10 w-10 text-white" />
          <span className="text-2xl font-bold tracking-tight text-white drop-shadow-md">
            NEU <span className="font-normal text-emerald-100">ARRS</span>
          </span>
        </Link>

        <div className="z-10 max-w-md space-y-6">
          <div className="space-y-3">
            <h1 className="text-5xl font-extrabold tracking-tight text-white drop-shadow-sm leading-tight">Welcome back.</h1>
            <p className="text-lg text-emerald-50/90 leading-relaxed font-medium">
              Log in to track your document requests, view transaction history, and securely checkout via PayMongo.
            </p>
          </div>
          
          <div className="space-y-5 pt-8">
            <div className="flex items-center gap-4 text-emerald-50">
              <div className="p-2 bg-white/10 rounded-full backdrop-blur-sm border border-white/20">
                <CheckCircle2 className="h-6 w-6 text-emerald-300" />
              </div>
              <span className="font-medium text-lg tracking-wide">Real-time request tracking</span>
            </div>
            <div className="flex items-center gap-4 text-emerald-50">
              <div className="p-2 bg-white/10 rounded-full backdrop-blur-sm border border-white/20">
                <CheckCircle2 className="h-6 w-6 text-emerald-300" />
              </div>
              <span className="font-medium text-lg tracking-wide">Instant secure payments</span>
            </div>
            <div className="flex items-center gap-4 text-emerald-50">
              <div className="p-2 bg-white/10 rounded-full backdrop-blur-sm border border-white/20">
                <CheckCircle2 className="h-6 w-6 text-emerald-300" />
              </div>
              <span className="font-medium text-lg tracking-wide">Direct communication with the registrar</span>
            </div>
          </div>
        </div>

        <div className="z-10 text-sm font-medium text-emerald-200/80">
          &copy; {new Date().getFullYear()} NEU Automated Registrar Request System
        </div>
      </div>

      {/* Right side: Login form (Custom UI) */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative bg-background">
        <Link href="/" className="absolute top-8 left-8 flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors lg:hidden">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to home
        </Link>

        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Sign in</h2>
            <p className="text-muted-foreground mt-2">Welcome back! Please enter your details.</p>
          </div>

          <div className="bg-card border border-border shadow-sm rounded-2xl p-8 space-y-6">
            
            <Button 
              type="button" 
              variant="outline" 
              className="w-full h-12 bg-background hover:bg-muted text-foreground font-medium rounded-xl border-border"
              onClick={handleGoogleSignIn}
              disabled={!isLoaded || isLoading}
            >
              <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
                <path d="M1 1h22v22H1z" fill="none" />
              </svg>
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-3 text-muted-foreground font-medium">Or continue with</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground font-medium">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    className="pl-9 h-11 bg-background border-border text-foreground focus-visible:ring-primary rounded-xl"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 h-11 bg-background border-border text-foreground focus-visible:ring-primary rounded-xl"
                    required
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all"
                disabled={!isLoaded || isLoading}
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

            <div className="text-center text-sm">
              <span className="text-muted-foreground">Don&apos;t have an account? </span>
              <Link href="/sign-up" className="font-semibold text-primary hover:underline">
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
