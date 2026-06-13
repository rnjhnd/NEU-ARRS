"use client";

import { useSignUp, useClerk } from "@clerk/nextjs";
import { FileBadge, ArrowLeft, Loader2, KeyRound, Mail, User, ShieldCheck, Zap, Clock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function SignUpPage() {
  const { signUp } = useSignUp();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  
  const [pendingVerification, setPendingVerification] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const clerk = useClerk();

  // Handle standard registration
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUp) return;
    setIsLoading(true);

    try {
      const { error: createError } = await signUp.create({
        firstName,
        lastName,
        emailAddress,
        password,
      });

      if (createError) {
        console.error(createError);
        toast.error(createError.longMessage || "An error occurred during sign-up. Please try again.");
        return;
      }

      // Send the OTP
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) {
        console.error(sendError);
        toast.error(sendError.longMessage || "Failed to send the verification code. Please check your email address.");
        return;
      }
      
      setPendingVerification(true);
      toast.success("Verification code sent. Please check your inbox.");
    } catch (err: unknown) {
      console.error(err);
      toast.error("An unexpected error occurred during sign-up.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle OTP verification
  const onPressVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUp) return;
    setIsLoading(true);

    try {
      const { error } = await signUp.verifications.verifyEmailCode({
        code,
      });

      if (error) {
        console.error(error);
        toast.error(error.longMessage || "Invalid verification code. Please try again.");
        return;
      }

      if (signUp.status === "complete") {
        await signUp.finalize();
        router.push("/");
      } else {
        toast.error("Additional verification is required to complete sign-up.");
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error("An unexpected error occurred. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google OAuth sign up
  const handleGoogleSignUp = async () => {
    if (!signUp) return;
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
    <div className="flex min-h-screen bg-background">
      {/* Left side: Branding / UI (Vibrant animated green gradient) */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] p-12 relative overflow-hidden text-white shadow-2xl z-10">
        <div className="absolute inset-0 bg-[#0A5C36]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-[#34d399]/30 via-[#0A5C36]/0 to-[#042F1A]/90 animate-pulse" style={{ animationDuration: '5s' }}></div>
        
        <Link href="/" className="flex items-center gap-2 z-10 w-fit hover:opacity-80 transition-opacity">
          <FileBadge className="h-10 w-10 text-white" />
          <span className="text-2xl font-bold tracking-tight text-white drop-shadow-md">
            NEU <span className="font-normal text-primary-foreground">ARRS</span>
          </span>
        </Link>

        <div className="z-10 max-w-md space-y-6">
          <div className="space-y-3">
            <h1 className="text-5xl font-extrabold tracking-tight text-white drop-shadow-sm leading-tight">Join the portal.</h1>
            <p className="text-lg text-primary-foreground/90 leading-relaxed font-medium">
              Create an account to request your official academic documents in seconds.
            </p>
          </div>
          
          <div className="grid gap-6 pt-8">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-primary-foreground/80">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg tracking-wide">Lightning Fast</h3>
                <p className="text-primary-foreground/80 font-medium">Skip the line and request your documents online instantly.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-primary-foreground/80">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg tracking-wide">100% Secure</h3>
                <p className="text-primary-foreground/80 font-medium">Enterprise-grade security protecting your academic records.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-primary-foreground/80">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg tracking-wide">24/7 Access</h3>
                <p className="text-primary-foreground/80 font-medium">Request documents anytime, anywhere, on any device.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="z-10 text-sm font-medium text-primary-foreground/80">
          &copy; {new Date().getFullYear()} NEU Automated Registrar Request System
        </div>
      </div>

      {/* Right side: Login form (Custom UI) */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative bg-background">
        <Link href="/" className="absolute top-8 left-8 flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors lg:hidden">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to home
        </Link>

        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          
          {!pendingVerification && (
            <>
              <div className="text-center">
                <h2 className="text-3xl font-bold tracking-tight text-foreground">Create an account</h2>
                <p className="text-muted-foreground mt-2">Sign up to get started.</p>
              </div>

              <div className="bg-card border border-border shadow-sm rounded-2xl p-8 space-y-6">
                
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full h-12 bg-background hover:bg-muted text-foreground font-medium rounded-xl border-border"
                  onClick={handleGoogleSignUp}
                  disabled={!signUp || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                      Please wait...
                    </>
                  ) : (
                    <>
                      <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
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
                    <span className="bg-card px-3 text-muted-foreground font-medium">Or register with</span>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-foreground font-medium">First name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="pl-9 h-11 bg-background border-border text-foreground focus-visible:ring-primary rounded-xl"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-foreground font-medium">Last name</Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="h-11 bg-background border-border text-foreground focus-visible:ring-primary rounded-xl"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground font-medium">Email address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={emailAddress}
                        onChange={(e) => setEmailAddress(e.target.value)}
                        className="pl-9 h-11 bg-background border-border text-foreground focus-visible:ring-primary rounded-xl"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-9 h-11 bg-background border-border text-foreground focus-visible:ring-primary rounded-xl"
                        required
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all mt-2"
                    disabled={!signUp || isLoading}
                  >
                    {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Continue"}
                  </Button>
                </form>

                <div className="text-center text-sm">
                  <span className="text-muted-foreground">Already have an account? </span>
                  <Link href="/sign-in" className="font-semibold text-primary hover:underline">
                    Sign in
                  </Link>
                </div>
              </div>
            </>
          )}

          {pendingVerification && (
            <>
              <div className="text-center">
                <h2 className="text-3xl font-bold tracking-tight text-foreground">Verify your email</h2>
                <p className="text-muted-foreground mt-2">
                  We sent a 6-digit verification code to <span className="font-semibold text-foreground">{emailAddress}</span>.
                </p>
              </div>

              <div className="bg-card border border-border shadow-sm rounded-2xl p-8 space-y-6">
                <form onSubmit={onPressVerify} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="code" className="text-foreground font-medium">Verification Code</Label>
                    <Input
                      id="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Enter 6-digit code"
                      className="h-12 bg-background border-border text-center text-lg tracking-widest text-foreground focus-visible:ring-primary rounded-xl"
                      required
                      maxLength={6}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all"
                    disabled={!signUp || isLoading || code.length !== 6}
                  >
                    {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Verify Email"}
                  </Button>
                </form>

                <div className="text-center text-sm">
                  <span className="text-muted-foreground">Didn&apos;t receive a code? </span>
                  <button 
                    onClick={() => {
                      setPendingVerification(false);
                      setCode("");
                    }} 
                    className="font-semibold text-primary hover:underline"
                  >
                    Try another email
                  </button>
                </div>
              </div>
            </>
          )}
          
        </div>
      </div>
    </div>
  );
}
