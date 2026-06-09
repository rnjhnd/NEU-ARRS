import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Ensure the user is authenticated and has the admin role
    await requireAdmin();

    const requests = await prisma.request.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error("[ADMIN_REQUESTS_GET]", error);
    return new NextResponse("Internal Error or Unauthorized", { status: 500 });
  }
}
