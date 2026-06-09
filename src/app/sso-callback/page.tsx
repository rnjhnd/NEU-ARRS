import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

export default function SSOCallbackPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center space-y-4 animate-in fade-in duration-500">
        <Loader2 className="h-12 w-12 animate-spin text-emerald-600" />
        <h2 className="text-xl font-semibold text-foreground tracking-tight">Authenticating...</h2>
        <p className="text-muted-foreground text-sm">Please wait while we securely log you in.</p>
      </div>
      <AuthenticateWithRedirectCallback 
        signInFallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/dashboard"
        continueSignUpUrl="/sign-up"
      />
    </div>
  );
}
