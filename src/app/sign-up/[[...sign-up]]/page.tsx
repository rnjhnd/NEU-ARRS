import { SignUp } from "@clerk/nextjs";
import { GraduationCap, ArrowLeft, ShieldCheck, Zap, Clock } from "lucide-react";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Left side: Branding / UI (Hidden on mobile) */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] p-12 bg-muted/20 border-r border-border relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"></div>
        
        <Link href="/" className="flex items-center gap-2 z-10 w-fit hover:opacity-80 transition-opacity">
          <GraduationCap className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold tracking-tight">
            NEU <span className="font-normal text-muted-foreground">Registrar</span>
          </span>
        </Link>

        <div className="z-10 max-w-md space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Join the portal.</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Create an account to request your official academic documents in seconds.
            </p>
          </div>
          
          <div className="grid gap-6 pt-4">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary mt-1">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Lightning Fast</h3>
                <p className="text-sm text-muted-foreground">Skip the line and request your documents online instantly.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary mt-1">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">100% Secure</h3>
                <p className="text-sm text-muted-foreground">Enterprise-grade security protecting your academic records.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary mt-1">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">24/7 Access</h3>
                <p className="text-sm text-muted-foreground">Request documents anytime, anywhere, on any device.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="z-10 text-sm font-medium text-muted-foreground">
          &copy; {new Date().getFullYear()} NEU Automated Registrar Request System
        </div>
      </div>

      {/* Right side: Login form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
        <Link href="/" className="absolute top-8 left-8 flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors lg:hidden">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to home
        </Link>
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
          <SignUp 
            path="/sign-up" 
            routing="path" 
            signInUrl="/sign-in" 
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "w-full shadow-none sm:shadow-lg border border-border bg-card rounded-2xl p-8",
                headerTitle: "text-2xl font-bold tracking-tight text-foreground",
                headerSubtitle: "text-muted-foreground",
                socialButtonsBlockButton: "border-border bg-background text-foreground hover:bg-muted transition-all rounded-lg h-11",
                socialButtonsBlockButtonText: "text-foreground font-medium",
                dividerLine: "bg-border",
                dividerText: "text-muted-foreground text-xs font-medium",
                formFieldLabel: "text-foreground font-medium",
                formFieldInput: "bg-background border-border text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary rounded-lg h-11 transition-all",
                formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm rounded-lg h-11 font-semibold transition-all",
                footerActionText: "text-muted-foreground",
                footerActionLink: "text-primary hover:text-primary/90 font-semibold",
                identityPreviewText: "text-foreground",
                identityPreviewEditButtonIcon: "text-muted-foreground hover:text-foreground",
                formFieldAction: "text-primary hover:text-primary/90",
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
