import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const requests = await prisma.request.findMany({
      where: {
        studentId: user.id,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error("Error fetching student requests:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
