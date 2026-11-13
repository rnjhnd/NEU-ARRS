import type { Request } from "@prisma/client";

export function identityReviewFixture(row: Pick<Request, "studentId" | "studentName" | "studentNumber">) {
  return { studentId: row.studentId, studentName: row.studentName, studentNumber: row.studentNumber,
    verifiedBy: "synthetic_registrar", verifiedAt: new Date("2026-11-13T00:00:00Z"), evidenceId: "synthetic_identity_evidence" };
}
