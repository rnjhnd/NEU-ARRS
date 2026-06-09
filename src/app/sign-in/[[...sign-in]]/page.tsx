import { SignIn } from "@clerk/nextjs";
import { GraduationCap, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Left side: Branding / UI (Hidden on mobile) */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] p-12 bg-muted/20 border-r border-border relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"></div>
        
        <Link href="/" className="flex items-center gap-2 z-10 w-fit hover:opacity-80 transition-opacity">
          <GraduationCap className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold tracking-tight">
            NEU <span className="font-normal text-muted-foreground">ARRS</span>
          </span>
        </Link>

        <div className="z-10 max-w-md space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Welcome back.</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Log in to track your document requests, view transaction history, and securely checkout via PayMongo.
            </p>
          </div>
          
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span>Real-time request tracking</span>
            </div>
            <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span>Instant secure payments</span>
            </div>
            <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span>Direct communication with the registrar</span>
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
          <SignIn 
            path="/sign-in" 
            routing="path" 
            signUpUrl="/sign-up" 
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
