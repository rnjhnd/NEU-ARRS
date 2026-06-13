import { clerkClient } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { StudentClient } from "./student-client";

export async function StudentsData() {
  // 1. Fetch all users from Clerk
  const client = await clerkClient();
  const response = await client.users.getUserList({
    limit: 100, // Fetch up to 100 for now, ideally we use Clerk's pagination API in the future
  });
  
  // 2. Filter out Admins and Serialize user data
  const users = response.data
    .filter(u => u.publicMetadata?.role !== "admin")
    .map(u => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      emailAddresses: u.emailAddresses.map(e => ({ emailAddress: e.emailAddress })),
      imageUrl: u.imageUrl,
    }));

  // 3. Aggregate request counts and LTV from Prisma
  const requests = await prisma.request.findMany({
    select: {
      studentId: true,
      amountPaid: true,
      paymentMethod: true,
      paymentStatus: true
    }
  });

  const countMap: Record<string, number> = {};
  const ltvMap: Record<string, number> = {};

  requests.forEach(r => {
    // Count
    countMap[r.studentId] = (countMap[r.studentId] || 0) + 1;

    // Lifetime Value (LTV)
    if (r.paymentStatus === "PAID" || r.paymentStatus === "CASH_ON_PICKUP") {
      let amount = 0;
      if (r.amountPaid) {
        amount = r.amountPaid / 100; // Centavos to PHP
      } else if (r.paymentMethod === "cash") {
        amount = 150; // Hardcoded fallback for existing cash payments without amountPaid
      }
      ltvMap[r.studentId] = (ltvMap[r.studentId] || 0) + amount;
    }
  });

  return <StudentClient users={users} countMap={countMap} ltvMap={ltvMap} />;
}
