import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Library, ArrowRight, ShieldCheck, Zap, Clock } from "lucide-react";

export default async function Home() {
  const { userId, sessionClaims } = await auth();

  // If user is already logged in, seamlessly redirect them to their respective portal
  if (userId) {
    const role = sessionClaims?.metadata?.role;
    if (role === "admin") {
      redirect("/admin");
    } else {
      redirect("/dashboard");
    }
  }

  // If not logged in, show an engaging landing page with NEU Brand Identity
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      {/* Header */}
      <header className="absolute top-0 w-full flex h-20 items-center justify-between px-6 md:px-12 z-50">
        <div className="flex items-center gap-2">
          <Library className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold tracking-tight">
            NEU <span className="font-normal text-muted-foreground">ARRS</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in">
            <Button variant="ghost" className="font-medium">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button className="font-medium shadow-sm">Get Started</Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center pt-20 pb-16 px-6 text-center">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"></div>
        
        <div className="max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-4">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
            Now live for all students
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-foreground leading-[1.1]">
            Official Documents, <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-600">
              Delivered Faster.
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A secure, modern, and lightning-fast portal to request your academic transcripts, diplomas, and certifications directly from the university registrar.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/sign-up" className="w-full sm:w-auto">
              <Button size="lg" className="w-full h-14 px-8 text-base shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
                Request a Document <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/sign-in" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full h-14 px-8 text-base bg-background/50 backdrop-blur-sm border-border hover:bg-muted">
                Track Existing Request
              </Button>
            </Link>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mt-32 animate-in fade-in duration-1000 delay-300 fill-mode-both">
          <div className="flex flex-col items-center text-center space-y-4 p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">Instant Processing</h3>
            <p className="text-muted-foreground text-sm">Automated workflows ensure your requests are routed immediately to the registrar queue.</p>
          </div>
          <div className="flex flex-col items-center text-center space-y-4 p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">Secure Payments</h3>
            <p className="text-muted-foreground text-sm">Pay securely online via GCash, Maya, or Credit Card using our integrated PayMongo checkout.</p>
          </div>
          <div className="flex flex-col items-center text-center space-y-4 p-6 rounded-2xl bg-card border border-border/50 shadow-sm">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <Clock className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">Real-time Tracking</h3>
            <p className="text-muted-foreground text-sm">Monitor the exact status of your document from processing to ready-for-pickup.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
