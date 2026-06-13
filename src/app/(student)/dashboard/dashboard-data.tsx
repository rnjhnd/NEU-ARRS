import prisma from "@/lib/prisma";
import { RequestList } from "./request-list";
import { FileText, CheckCircle, Clock } from "lucide-react";

export async function DashboardData({ userId }: { userId: string }) {
  const requests = await prisma.request.findMany({
    where: { studentId: userId },
    orderBy: { createdAt: "desc" },
  });

  const activeRequests = requests.filter(r => r.status !== 'COMPLETED' && r.status !== 'CANCELLED').length;
  const completedRequests = requests.filter(r => r.status === 'COMPLETED').length;
  const totalRequests = requests.length;

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

  return (
    <>
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-background/60 backdrop-blur-md rounded-2xl p-6 border border-border/50 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-yellow-500/10 text-yellow-600 dark:bg-gold/10 dark:text-gold rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Active Requests</p>
            <h3 className="text-2xl font-bold">{activeRequests}</h3>
          </div>
        </div>
        <div className="bg-background/60 backdrop-blur-md rounded-2xl p-6 border border-border/50 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-primary/10 text-primary rounded-xl">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Completed</p>
            <h3 className="text-2xl font-bold">{completedRequests}</h3>
          </div>
        </div>
        <div className="bg-background/60 backdrop-blur-md rounded-2xl p-6 border border-border/50 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-primary/10 text-primary rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total Processed</p>
            <h3 className="text-2xl font-bold">{totalRequests}</h3>
          </div>
        </div>
      </div>

      <RequestList requests={mappedRequests as any} />
    </>
  );
}
