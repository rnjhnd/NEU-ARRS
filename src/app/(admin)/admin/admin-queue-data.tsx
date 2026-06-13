import prisma from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";
import { AdminQueueClient } from "./admin-queue-client";

export async function AdminQueueData() {
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
    studentName: userMap.get(req.studentId)?.name || "Unknown Student",
    studentEmail: userMap.get(req.studentId)?.email || "No email",
    documentType: docMap.get(req.documentType) || LEGACY_DOC_MAP[req.documentType] || req.documentType.replace(/_/g, " ")
  }));

  return <AdminQueueClient initialRequests={mappedRequests as any} />;
}
