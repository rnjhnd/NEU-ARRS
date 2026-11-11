import { loadAdminQueue } from "@/lib/admin-queue-data";
import { AdminQueueClient } from "./admin-queue-client";

export async function AdminQueueData() {
  return <AdminQueueClient initialQueue={await loadAdminQueue()} />;
}
