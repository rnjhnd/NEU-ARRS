import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { AdminQueueClient } from "./admin-queue-client";

export default async function AdminPage() {
  // Ensure the user is an admin before rendering or fetching data
  await requireAdmin();

  const requests = await prisma.request.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Document Queue</h2>
        <p className="text-muted-foreground">
          Manage and process incoming student document requests.
        </p>
      </div>
      
      <AdminQueueClient initialRequests={requests} />
    </div>
  );
}
