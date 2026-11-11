import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { checkoutAmountSchema } from "./paymongo-checkout";
import { expireUnpaidCheckout, type ExpiryResult } from "./checkout-expiry";

export const CLEANUP_JOB_NAME = "cleanup-unpaid";
const BATCH_SIZE = 25;
const CONCURRENCY = 3;
const LEASE_MS = 120_000; // Longer than the route's 60-second function limit.
const WORK_MS = 30_000; // Leave time for the last provider check and transaction.
const transactionOptions = { maxWait: 2000, timeout: 5000 };
const select = {
  id: true, studentId: true, createdAt: true, updatedAt: true, submissionKey: true,
  paymongoCheckoutId: true, quotedAmountCentavos: true,
  checkoutAttempt: { select: { leaseUntil: true } },
} satisfies Prisma.RequestSelect;
type Candidate = Prisma.RequestGetPayload<{ select: typeof select }>;
type Cursor = { createdAt: Date; id: string } | null;
type Proof = Extract<ExpiryResult, { kind: "expired" }> | { kind: "no_checkout_attempt" };
class LostLeaseError extends Error {}

async function claimJob() {
  const now = new Date();
  try {
    await prisma.cronJobState.upsert({
      where: { name: CLEANUP_JOB_NAME }, update: {},
      create: { name: CLEANUP_JOB_NAME, leaseUntil: new Date(0) },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
  const token = randomUUID();
  const claimed = await prisma.cronJobState.updateMany({
    where: { name: CLEANUP_JOB_NAME, leaseUntil: { lte: now } },
    data: { leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (claimed.count !== 1) return null;
  const state = await prisma.cronJobState.findUnique({ where: { name: CLEANUP_JOB_NAME } });
  if (!state || state.leaseToken !== token || Boolean(state.cursorCreatedAt) !== Boolean(state.cursorId)) throw new LostLeaseError();
  return { token, cursor: state.cursorId && state.cursorCreatedAt ? { id: state.cursorId, createdAt: state.cursorCreatedAt } : null };
}

async function withLease<T>(token: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    const owned = await tx.cronJobState.updateMany({
      where: { name: CLEANUP_JOB_NAME, leaseToken: token, leaseUntil: { gt: new Date() } },
      data: { updatedAt: new Date() },
    });
    if (owned.count !== 1) throw new LostLeaseError();
    return work(tx);
  }, transactionOptions);
}

async function writeReview(tx: Prisma.TransactionClient, row: Candidate, reason: string) {
  const id = `cleanup-review:${row.id}:${row.updatedAt.toISOString()}:${reason}`;
  await tx.auditLog.upsert({
    where: { id }, update: {},
    create: { id, adminId: "system:cleanup-unpaid", action: "UNPAID_CLEANUP_REVIEW", requestId: row.id,
      details: JSON.stringify({ reason, checkoutId: row.paymongoCheckoutId, observedUpdatedAt: row.updatedAt.toISOString() }) },
  });
}

async function recordReview(row: Candidate, reason: string, token: string) {
  await withLease(token, tx => writeReview(tx, row, reason));
}

async function cancelWithProof(row: Candidate, cutoff: Date, proof: Proof, token: string) {
  return withLease(token, async tx => {
    if (proof.kind === "expired") {
      const id = `cleanup-expired:${proof.livemode ? "live" : "test"}:${proof.checkoutId}`;
      await tx.auditLog.upsert({
        where: { id }, update: {},
        create: { id, adminId: "system:cleanup-unpaid", action: "PAYMONGO_CHECKOUT_EXPIRY_VERIFIED", requestId: row.id, details: JSON.stringify(proof) },
      });
      if (row.submissionKey === null || !checkoutAmountSchema.safeParse(row.quotedAmountCentavos).success) {
        // The pre-idempotency implementation may have overwritten earlier
        // session references. Closing the latest one cannot prove that history.
        await writeReview(tx, row, "legacy_checkout_history_unverified");
        return "review";
      }
    } else {
      // Preparation locks this same row before inserting an attempt. Lock first,
      // then let the next statement recheck the relation under a fresh snapshot.
      // updatedAt alone can collide within one millisecond.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Request" WHERE "id" = ${row.id} FOR UPDATE`);
    }
    const changed = await tx.request.updateMany({
      where: {
        id: row.id, studentId: row.studentId, updatedAt: row.updatedAt, createdAt: { lt: cutoff },
        paymentMethod: "online", status: "PENDING_PAYMENT", paymentStatus: "UNPAID", paymongoPaymentId: null,
        paymongoCheckoutId: row.paymongoCheckoutId, quotedAmountCentavos: row.quotedAmountCentavos, submissionKey: row.submissionKey,
        ...(proof.kind === "no_checkout_attempt" ? { checkoutAttempt: { is: null } } : {}),
      },
      data: { status: "CANCELLED", cancelReason: "Payment window expired (auto-cancelled)", notificationVersion: { increment: 1 } },
    });
    if (changed.count === 1) await tx.auditLog.create({ data: {
      adminId: "system:cleanup-unpaid", action: "UNPAID_REQUEST_AUTO_CANCELLED", requestId: row.id,
      details: JSON.stringify({ fromStatus: "PENDING_PAYMENT", toStatus: "CANCELLED", cutoff: cutoff.toISOString(), previousUpdatedAt: row.updatedAt.toISOString(), proof }),
    } });
    return changed.count === 1 ? "cancelled" : "conflicts";
  });
}

async function processCandidate(row: Candidate, cutoff: Date, token: string) {
  if (row.paymongoCheckoutId) {
    const result = await expireUnpaidCheckout(row);
    if (result.kind === "expired") return cancelWithProof(row, cutoff, result, token);
    if (result.kind === "deferred") return "deferred";
    await recordReview(row, result.reason, token);
    return "review";
  }
  if (row.checkoutAttempt?.leaseUntil && row.checkoutAttempt.leaseUntil > new Date()) return "deferred";
  if (row.checkoutAttempt || row.submissionKey === null || !checkoutAmountSchema.safeParse(row.quotedAmountCentavos).success) {
    await recordReview(row, "unconfirmed_checkout_reference", token);
    return "review";
  }
  // The new intent-based path proves no POST occurred without an attempt.
  return cancelWithProof(row, cutoff, { kind: "no_checkout_attempt" }, token);
}

/** Bounded keyset scan; review rows cannot starve the rest of the queue. */
export async function cleanupUnpaidRequests() {
  const deadline = Date.now() + WORK_MS;
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const lease = await claimJob();
  if (!lease) return { success: true, busy: true, scanned: 0, cancelled: 0 };
  let cursor: Cursor = lease.cursor;
  const counts = { scanned: 0, cancelled: 0, deferred: 0, review: 0, conflicts: 0, failed: 0 };
  try {
    const scan = (after: Cursor) => prisma.request.findMany({
      where: {
        paymentMethod: "online", status: "PENDING_PAYMENT", paymentStatus: "UNPAID", paymongoPaymentId: null, createdAt: { lt: cutoff },
        ...(after ? { OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] } : {}),
      },
      select, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: BATCH_SIZE + 1,
    });
    let found = await scan(cursor);
    if (found.length === 0 && cursor) { cursor = null; found = await scan(null); }
    const batch = found.slice(0, BATCH_SIZE);
    for (let index = 0; index < batch.length && Date.now() < deadline; index += CONCURRENCY) {
      const group = batch.slice(index, index + CONCURRENCY);
      const results = await Promise.allSettled(group.map(row => processCandidate(row, cutoff, lease.token)));
      for (const result of results) {
        counts.scanned++;
        if (result.status === "fulfilled") counts[result.value]++;
        else {
          counts.failed++;
          console.error("[Cleanup] Candidate failed", { error: result.reason instanceof Error ? result.reason.name : "UnknownError" });
        }
      }
      const last = group[group.length - 1];
      cursor = { id: last.id, createdAt: last.createdAt };
    }
    const hasMore = counts.scanned < found.length;
    if (!hasMore) cursor = null;
    return { success: counts.failed === 0, busy: false, ...counts, hasMore };
  } finally {
    const released = await prisma.cronJobState.updateMany({
      where: { name: CLEANUP_JOB_NAME, leaseToken: lease.token },
      data: { leaseToken: null, leaseUntil: new Date(0), cursorId: cursor?.id ?? null, cursorCreatedAt: cursor?.createdAt ?? null },
    });
    if (released.count !== 1) throw new LostLeaseError();
  }
}
