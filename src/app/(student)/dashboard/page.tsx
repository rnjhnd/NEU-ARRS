import prisma from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RequestList } from "./request-list";
import { Plus, FileText, CheckCircle, Clock } from "lucide-react";

export default async function StudentDashboardPage() {
  const { userId } = await auth();
  const user = await currentUser();

  if (!userId) {
    redirect("/sign-in");
  }

  const requests = await prisma.request.findMany({
    where: { studentId: userId },
    orderBy: { createdAt: "desc" },
  });

  const activeRequests = requests.filter(r => r.status !== 'COMPLETED' && r.status !== 'CANCELLED').length;
  const completedRequests = requests.filter(r => r.status === 'COMPLETED').length;
  const totalRequests = requests.length;

  const docConfigs = await prisma.documentConfig.findMany();
  const docMap = new Map(docConfigs.map(c => [c.typeId, c.label]));

  const mappedRequests = requests.map(req => ({
    ...req,
    documentType: docMap.get(req.documentType) || req.documentType.replace("_", " ")
  }));

  return (
    <div className="space-y-8 w-full">
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-8 sm:p-10 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 rounded-full bg-emerald-400/20 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
              Welcome back, {user?.firstName || "Student"}!
            </h1>
            <p className="text-emerald-100/90 text-lg font-medium max-w-xl">
              Track your academic document requests and initiate new ones instantly.
            </p>
          </div>
          <Link href="/dashboard/new" className="shrink-0">
            <Button size="lg" className="bg-white/20 hover:bg-white/30 text-white border-none shadow-sm backdrop-blur-md transition-transform hover:scale-105 rounded-full font-bold px-8">
              <Plus className="w-5 h-5 mr-2" />
              New Request
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-background/60 backdrop-blur-md rounded-2xl p-6 border border-border/50 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-yellow-500/10 text-yellow-600 dark:bg-gold/10 dark:text-gold rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Active Requests</p>
            <h3 className="text-2xl font-bold">{activeRequests}</h3>
          </div>
        </div>
        <div className="bg-background/60 backdrop-blur-md rounded-2xl p-6 border border-border/50 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-primary/10 text-primary rounded-xl">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Completed</p>
            <h3 className="text-2xl font-bold">{completedRequests}</h3>
          </div>
        </div>
        <div className="bg-background/60 backdrop-blur-md rounded-2xl p-6 border border-border/50 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-primary/10 text-primary rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total Processed</p>
            <h3 className="text-2xl font-bold">{totalRequests}</h3>
          </div>
        </div>
      </div>

      <RequestList requests={mappedRequests as any} />
    </div>
  );
}
