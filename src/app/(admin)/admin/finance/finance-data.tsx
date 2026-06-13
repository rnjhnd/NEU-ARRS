import prisma from "@/lib/prisma";
import { FinanceClient } from "./finance-client";

export async function FinanceData() {
  // Fetch all requests
  const requests = await prisma.request.findMany({
    orderBy: { createdAt: "asc" },
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

  return <FinanceClient requests={mappedRequests as any} />;
}
