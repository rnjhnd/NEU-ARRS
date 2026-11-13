import type { RequestIdentityReview } from "@prisma/client";

export const identityReviewSelect = {
  studentId: true, studentName: true, studentNumber: true, verifiedBy: true, verifiedAt: true, evidenceId: true,
} as const;

type Identity = { studentId: string; studentName: string; studentNumber: string };
export type ReviewedRequest = Identity & {
  identityReview?: Omit<RequestIdentityReview, "requestId"> | null;
};

/** Account authentication and a valid student-number format are not verification. */
export function hasVerifiedRequestIdentity(request: ReviewedRequest): boolean {
  const review = request.identityReview;
  return Boolean(review && review.verifiedBy && review.evidenceId &&
    Number.isFinite(review.verifiedAt.getTime()) &&
    review.studentId === request.studentId && review.studentName === request.studentName &&
    review.studentNumber === request.studentNumber && review.verifiedBy !== request.studentId);
}
