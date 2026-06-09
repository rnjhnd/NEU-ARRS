import { SignUp } from "@clerk/nextjs";
import { GraduationCap, ArrowLeft, ShieldCheck, Zap, Clock } from "lucide-react";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Left side: Branding / UI (Theme independent deep green) */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] p-12 bg-[#042F1A] border-r border-[#0A5C36]/30 relative overflow-hidden text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-[#0A5C36]/40 via-[#042F1A] to-[#042F1A]"></div>
        
        <Link href="/" className="flex items-center gap-2 z-10 w-fit hover:opacity-80 transition-opacity">
          <GraduationCap className="h-8 w-8 text-white" />
          <span className="text-xl font-bold tracking-tight text-white">
            NEU <span className="font-normal text-slate-300">ARRS</span>
          </span>
        </Link>

        <div className="z-10 max-w-md space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tight text-white">Join the portal.</h1>
            <p className="text-lg text-slate-300 leading-relaxed">
              Create an account to request your official academic documents in seconds.
            </p>
          </div>
          
          <div className="grid gap-6 pt-4">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-[#0A5C36]/50 text-[#34d399] mt-1">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Lightning Fast</h3>
                <p className="text-sm text-slate-400">Skip the line and request your documents online instantly.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-[#0A5C36]/50 text-[#34d399] mt-1">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">100% Secure</h3>
                <p className="text-sm text-slate-400">Enterprise-grade security protecting your academic records.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-[#0A5C36]/50 text-[#34d399] mt-1">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">24/7 Access</h3>
                <p className="text-sm text-slate-400">Request documents anytime, anywhere, on any device.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="z-10 text-sm font-medium text-slate-400">
          &copy; {new Date().getFullYear()} NEU Automated Registrar Request System
        </div>
      </div>

      {/* Right side: Login form (Hardcoded to Light Mode) */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative bg-slate-50">
        <Link href="/" className="absolute top-8 left-8 flex items-center text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors lg:hidden">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to home
        </Link>
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
          <SignUp 
            path="/sign-up" 
            routing="path" 
            signInUrl="/sign-in" 
            appearance={{
              variables: {
                colorBackground: "#ffffff",
                colorText: "#0f172a",
                colorPrimary: "#0A5C36",
                colorTextSecondary: "#64748b",
                colorInputBackground: "#ffffff",
                colorInputText: "#0f172a",
                colorDanger: "#ef4444",
                colorSuccess: "#10b981",
              },
              elements: {
                rootBox: "w-full",
                card: "w-full shadow-lg border border-slate-200 bg-white rounded-2xl p-8",
                headerTitle: "text-2xl font-bold tracking-tight text-slate-900",
                headerSubtitle: "text-slate-500",
                socialButtonsBlockButton: "border-slate-200 bg-white text-slate-900 hover:bg-slate-50 transition-all rounded-lg h-11",
                socialButtonsBlockButtonText: "text-slate-900 font-medium",
                dividerLine: "bg-slate-200",
                dividerText: "text-slate-500 text-xs font-medium",
                formFieldLabel: "text-slate-900 font-medium",
                formFieldInput: "bg-white border-slate-200 text-slate-900 focus:ring-2 focus:ring-[#0A5C36]/20 focus:border-[#0A5C36] rounded-lg h-11 transition-all",
                formButtonPrimary: "bg-[#0A5C36] hover:bg-[#0A5C36]/90 text-white shadow-sm rounded-lg h-11 font-semibold transition-all",
                footerActionText: "text-slate-500",
                footerActionLink: "text-[#0A5C36] hover:text-[#0A5C36]/90 font-semibold",
                identityPreviewText: "text-slate-900",
                identityPreviewEditButtonIcon: "text-slate-500 hover:text-slate-900",
                formFieldAction: "text-[#0A5C36] hover:text-[#0A5C36]/90",
                watermarkBox: "hidden",
                watermark: "hidden"
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
