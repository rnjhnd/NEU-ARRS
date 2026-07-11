import prisma from "@/lib/prisma";
import { RequestList } from "./request-list";
import { FileText, CheckCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getSystemSetting } from "@/app/actions/admin.actions";

export async function DashboardData({ userId }: { userId: string }) {
  const [requests, maintenanceSetting] = await Promise.all([
    prisma.request.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: "desc" },
    }),
    getSystemSetting("MAINTENANCE_MODE"),
  ]);

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-yellow-500/10 text-yellow-600 dark:bg-gold/10 dark:text-gold rounded-2xl shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground truncate">Active Requests</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground truncate">{activeRequests}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-primary/10 text-primary rounded-2xl shrink-0">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground truncate">Completed</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground truncate">{completedRequests}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl">
          <CardContent className="p-6 flex flex-1 items-center gap-5">
            <div className="p-4 bg-slate-500/10 text-slate-600 dark:text-slate-400 rounded-2xl shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground truncate">Total Processed</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground truncate">{totalRequests}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <RequestList requests={mappedRequests as any} isMaintenanceMode={maintenanceSetting?.value === "true"} />
    </>
  );
}
