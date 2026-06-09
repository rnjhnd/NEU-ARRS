import { requireAdmin } from "@/lib/auth";
import { clerkClient } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { StudentClient } from "./student-client";

export const metadata = { title: "Student Directory" };

export default async function StudentsPage() {
  await requireAdmin();
  
  // 1. Fetch all users from Clerk
  const client = await clerkClient();
  const response = await client.users.getUserList({
    limit: 100, // Fetch up to 100 for now, ideally we use Clerk's pagination API in the future
  });
  
  // Serialize user data so we can pass it securely to the client
  const users = response.data.map(u => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    emailAddresses: u.emailAddresses.map(e => ({ emailAddress: e.emailAddress })),
    imageUrl: u.imageUrl,
    publicMetadata: u.publicMetadata
  }));

  // 2. Aggregate request counts from Prisma
  const requestCounts = await prisma.request.groupBy({
    by: ['studentId'],
    _count: {
      id: true
    }
  });
  
  const countMap: Record<string, number> = {};
  requestCounts.forEach(r => { countMap[r.studentId] = r._count.id; });

  return <StudentClient users={users} countMap={countMap} />;
}
