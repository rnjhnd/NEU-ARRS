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

    const docConfigs = await prisma.documentConfig.findMany();
    const docMap = new Map(docConfigs.map(c => [c.typeId, c.label]));

    const LEGACY_DOC_MAP: Record<string, string> = {
      "TRANSCRIPT_OF_RECORDS": "Transcript of Records",
      "GOOD_MORAL": "Good Moral Certificate",
      "LEAVE_OF_ABSENCE": "Leave of Absence",
      "TRUE_COPY_OF_GRADES": "True Copy of Grades",
      "CERTIFICATE_OF_ENROLLMENT": "Certificate of Enrollment",
      "DIPLOMA": "Diploma"
    };

    const mappedRequests = requests.map(req => ({
      ...req,
      documentType: docMap.get(req.documentType) || LEGACY_DOC_MAP[req.documentType] || req.documentType.replace(/_/g, " ")
    }));

    return NextResponse.json(mappedRequests);
  } catch (error) {
    console.error("Error fetching student requests:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
