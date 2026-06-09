import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Ensure the user is authenticated and has the admin role
    await requireAdmin();

    const requests = await prisma.request.findMany({
      orderBy: { createdAt: "desc" },
    });

    const client = await clerkClient();
    const { data: users } = await client.users.getUserList();
    const userMap = new Map(users.map(u => [
      u.id, 
      {
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Unknown Student",
        email: u.emailAddresses[0]?.emailAddress || "No email"
      }
    ]));

    const mappedRequests = requests.map(req => ({
      ...req,
      studentName: userMap.get(req.studentId)?.name || "Unknown Student",
      studentEmail: userMap.get(req.studentId)?.email || "No email"
    }));

    return NextResponse.json(mappedRequests);
  } catch (error) {
    console.error("[ADMIN_REQUESTS_GET]", error);
    return new NextResponse("Internal Error or Unauthorized", { status: 500 });
  }
}
