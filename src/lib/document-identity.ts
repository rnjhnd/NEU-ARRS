import { z } from "zod";
export const documentIdentityShape = { documentTypeId: z.string().min(1), documentLabel: z.string() };
export const legacyDocumentLabels: Record<string, string> = {
  TRANSCRIPT_OF_RECORDS: "Transcript of Records", GOOD_MORAL: "Good Moral Certificate", LEAVE_OF_ABSENCE: "Leave of Absence",
  TRUE_COPY_OF_GRADES: "True Copy of Grades", CERTIFICATE_OF_ENROLLMENT: "Certificate of Enrollment", DIPLOMA: "Diploma",
};
export function documentIdentity(documentTypeId: string, label?: string) {
  return { documentTypeId, documentLabel: label ?? legacyDocumentLabels[documentTypeId] ?? documentTypeId.replace(/_/g, " ") };
}
