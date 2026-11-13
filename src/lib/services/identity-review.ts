import "server-only";
import prisma from "../prisma";
import { hasVerifiedRequestIdentity, identityReviewSelect } from "../request-identity";
export class IdentityReviewError extends Error {}
type Review = { requestId: string; expectedVersion: string; decision: "verify" | "revoke"; reason: string };
export async function applyIdentityReview(actorId: string, input: Review) {
  await prisma.$transaction(async tx => {
    // Payment callbacks use the same row lock. Evidence cannot be revoked
    // between their identity check and automatic workflow advancement.
    await tx.$queryRaw`SELECT "id" FROM "Request" WHERE "id" = ${input.requestId} FOR UPDATE`;
    const request = await tx.request.findUnique({ where: { id: input.requestId }, include: { identityReview: { select: identityReviewSelect } } });
    if (!request || request.updatedAt.toISOString() !== input.expectedVersion) throw new IdentityReviewError("The request changed. Refresh and review its current details.");
    if (request.studentId === actorId) throw new IdentityReviewError("You cannot verify your own academic identity.");
    if (input.decision === "verify" && hasVerifiedRequestIdentity(request)) throw new IdentityReviewError("This request identity is already verified.");
    if (input.decision === "revoke" && !request.identityReview) throw new IdentityReviewError("This request has no active identity attestation.");
    await tx.request.update({ where: { id: request.id, updatedAt: request.updatedAt },
      data: { updatedAt: new Date(Math.max(Date.now(), request.updatedAt.getTime() + 1)) } });
    const audit = await tx.auditLog.create({ data: {
      adminId: actorId, requestId: request.id,
      action: input.decision === "verify" ? "STUDENT_IDENTITY_VERIFIED" : "STUDENT_IDENTITY_REVOKED",
      details: JSON.stringify({ source: "registrar_school_records", reason: input.reason,
        studentId: request.studentId, studentName: request.studentName, studentNumber: request.studentNumber,
        previousEvidenceId: request.identityReview?.evidenceId ?? null }),
    } });
    if (input.decision === "verify") {
      const data = { studentId: request.studentId, studentName: request.studentName, studentNumber: request.studentNumber,
        verifiedBy: actorId, verifiedAt: audit.createdAt, evidenceId: audit.id };
      await tx.requestIdentityReview.upsert({ where: { requestId: request.id }, create: { requestId: request.id, ...data }, update: data });
    } else {
      await tx.requestIdentityReview.delete({ where: { requestId: request.id } });
    }
  }, { maxWait: 2000, timeout: 8000 });
}
