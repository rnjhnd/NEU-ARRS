import prisma from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RequestList } from "./request-list";
import { Plus } from "lucide-react";

export default async function StudentDashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const requests = await prisma.request.findMany({
    where: { studentId: userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-8 w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage and track your document requests.
          </p>
        </div>
        <Link href="/dashboard/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Request
          </Button>
        </Link>
      </div>

      <RequestList requests={requests} />
    </div>
  );
}
