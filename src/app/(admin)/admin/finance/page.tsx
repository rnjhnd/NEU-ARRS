import { requireAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { FinanceClient } from "./finance-client";

export const metadata = { title: "Financial Analytics" };

export default async function FinancePage() {
  await requireAdmin();
  
  // Fetch only COMPLETED requests that are PAID
  const requests = await prisma.request.findMany({
    where: {
      status: "COMPLETED",
      paymentStatus: "PAID"
    },
    select: {
      id: true,
      amountPaid: true,
      paymentMethod: true,
      createdAt: true
    },
    orderBy: { createdAt: "asc" }
  });
  
  return <FinanceClient data={requests} />;
}
