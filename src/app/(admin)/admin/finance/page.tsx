import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { FinanceClient } from "./finance-client";

export default async function FinancePage() {
  await requireAdmin();

  // Fetch all requests
  const requests = await prisma.request.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-8 w-full">
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-8 sm:p-10 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 rounded-full bg-primary/20 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
              Financial Analytics
            </h1>
            <p className="text-white/90 text-lg font-medium max-w-xl">
              Monitor revenue streams, payment methods, and historical financial trends.
            </p>
          </div>
        </div>
      </div>
      
      <FinanceClient requests={requests} />
    </div>
  );
}
