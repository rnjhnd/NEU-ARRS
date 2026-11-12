import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { enqueueRequestNotification } from "../src/lib/notification-content.ts";

class RollbackSmoke extends Error {}

export async function smokeMigratedDatabase(connectionString) {
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });
  const suffix = randomUUID();
  try {
    await assert.rejects(client.$transaction(async tx => {
      const roleOperation = await tx.roleChangeOperation.create({ data: {
        id: `role-smoke:${suffix}`, actorId: "migration_test_admin", targetId: "migration_test_student",
        previousRole: "student", previousOperationId: "unmanaged", nextRole: "employee", activeKey: "global",
      } });
      const access = await tx.roleAccess.create({ data: { userId: `role-smoke:${suffix}`, role: "employee", operationId: roleOperation.id } });
      assert.equal(access.blocked, true);
      await tx.roleChangeOperation.update({ where: { id: roleOperation.id }, data: { stage: "COMPLETE", activeKey: null } });
      await tx.roleAccess.update({ where: { userId: access.userId, operationId: roleOperation.id }, data: { blocked: false } });
      assert.equal((await tx.roleAccess.findUnique({ where: { userId: access.userId } })).blocked, false);
      const document = await tx.documentConfig.create({ data: {
        typeId: `MIGRATION_SMOKE_${suffix}`, label: "Migration test document", description: "Synthetic test only", price: 15050,
      } });
      await tx.systemSettings.create({ data: { key: `MIGRATION_SMOKE_${suffix}`, value: "{}" } });
      const request = await tx.request.create({ data: {
        studentId: "migration_test_student", studentName: "Synthetic Student", studentNumber: "22-12345-123",
        documentType: document.typeId, purpose: "PERSONAL", paymentMethod: "online",
        paymentStatus: "PAID", status: "PROCESSING", amountPaid: 151, paymongoPaymentId: "pay_test123",
      } });
      const changed = await tx.request.update({
        where: { id: request.id, updatedAt: request.updatedAt, status: "PROCESSING", paymentStatus: "PAID" },
        data: { status: "CANCELLED", paymentStatus: "REFUNDED" },
      });
      assert.equal(changed.paymentStatus, "REFUNDED");
      await tx.auditLog.create({ data: {
        id: `migration-smoke:${suffix}`, adminId: "system:migration-test", action: "SMOKE_TEST", details: "{}", requestId: request.id,
      } });
      assert.ok(await tx.auditLog.findUnique({ where: { id: `migration-smoke:${suffix}` } }));
      assert.ok(await tx.systemSettings.findUnique({ where: { key: `MIGRATION_SMOKE_${suffix}` } }));
      assert.ok(await tx.documentConfig.findUnique({ where: { typeId: document.typeId } }));
      const pending = await tx.request.create({ data: {
        studentId: "migration_test_student", studentName: "Synthetic Student", studentNumber: "22-12345-123",
        documentType: document.typeId, purpose: "PERSONAL", paymentMethod: "online",
        submissionKey: suffix, quotedAmountCentavos: 15050,
      } });
      assert.equal((await tx.request.findUnique({ where: {
        studentId_submissionKey: { studentId: pending.studentId, submissionKey: suffix },
      } })).id, pending.id);
      const attempt = await tx.checkoutAttempt.create({ data: {
        requestId: pending.id, payload: { frozenAmount: 15050 }, livemode: false, credentialFingerprint: "synthetic", leaseUntil: new Date(0),
      } });
      const lease = { requestId: pending.id, leaseUntil: { lte: new Date() }, request: {
        studentId: pending.studentId, status: "PENDING_PAYMENT", paymentStatus: "UNPAID", paymentMethod: "online", paymongoPaymentId: null, paymongoCheckoutId: null,
      } };
      const leaseData = { leaseUntil: new Date(Date.now() + 30_000) };
      assert.equal((await tx.checkoutAttempt.updateMany({ where: lease, data: leaseData })).count, 1);
      assert.equal((await tx.checkoutAttempt.updateMany({ where: lease, data: leaseData })).count, 0);
      assert.equal((await tx.checkoutAttempt.findUnique({ where: { requestId: pending.id } })).idempotencyKey, attempt.idempotencyKey);
      assert.deepEqual(attempt.payload, { frozenAmount: 15050 });
      const job = await tx.cronJobState.upsert({
        where: { name: `migration-smoke-${suffix}` }, update: {},
        create: { name: `migration-smoke-${suffix}`, leaseUntil: new Date(0) },
      });
      assert.equal((await tx.cronJobState.updateMany({
        where: { name: job.name, leaseUntil: { lte: new Date() } },
        data: { leaseToken: suffix, leaseUntil: new Date(Date.now() + 120_000) },
      })).count, 1);
      assert.equal((await tx.cronJobState.updateMany({
        where: { name: job.name, leaseToken: "stale-worker" }, data: { leaseToken: null },
      })).count, 0);
      assert.equal((await tx.cronJobState.updateMany({
        where: { name: job.name, leaseToken: suffix, leaseUntil: { gt: new Date() } },
        data: { cursorId: pending.id, cursorCreatedAt: pending.createdAt },
      })).count, 1);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Request" WHERE "id" = ${pending.id} FOR UPDATE`);
      // An absent-attempt guard must refuse cancellation once preparation won.
      assert.equal((await tx.request.updateMany({
        where: { id: pending.id, checkoutAttempt: { is: null }, paymentStatus: "UNPAID" },
        data: { status: "CANCELLED" },
      })).count, 0);
      const nextPage = await tx.request.findMany({
        where: { paymentMethod: "online", status: "PENDING_PAYMENT", paymentStatus: "UNPAID", createdAt: { lt: new Date(Date.now() + 1000) },
          OR: [{ createdAt: { gt: new Date(0) } }, { createdAt: new Date(0), id: { gt: "" } }] },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 26,
        select: { id: true, checkoutAttempt: { select: { leaseUntil: true } } },
      });
      assert.ok(nextPage.some(row => row.id === pending.id && row.checkoutAttempt !== null));
      const late = await tx.request.create({ data: {
        studentId: "migration_test_student", studentName: "Synthetic Student", studentNumber: "22-12345-123",
        documentType: document.typeId, purpose: "PERSONAL", paymentMethod: "online", status: "CANCELLED",
        paymongoCheckoutId: "cs_late_smoke", quotedAmountCentavos: 15050,
      } });
      assert.equal((await tx.request.updateMany({
        where: { id: late.id, status: "CANCELLED", paymentStatus: "UNPAID", paymongoPaymentId: null, paymongoCheckoutId: "cs_late_smoke", quotedAmountCentavos: 15050 },
        data: { paymentStatus: "PAID", paymongoPaymentId: "pay_late_smoke", amountPaid: 151 },
      })).count, 1);
      assert.equal((await tx.request.findUnique({ where: { id: late.id } })).status, "CANCELLED");
      await tx.auditLog.create({ data: { id: `refund-claim:smoke:${suffix}`, adminId: "system:refunds", action: "REFUND_SUBMISSION_CLAIMED", details: "{}", requestId: late.id } });
      assert.equal((await tx.request.updateMany({
        where: { id: late.id, status: "CANCELLED", paymentStatus: "PAID", paymongoPaymentId: "pay_late_smoke" },
        data: { paymentStatus: "REFUNDED" },
      })).count, 1);
      assert.equal((await tx.request.findUnique({ where: { id: late.id } })).status, "CANCELLED");
      assert.equal((await tx.request.updateMany({
        where: { id: late.id, paymentStatus: "UNPAID" }, data: { paymentStatus: "PAID" },
      })).count, 0);
      const noticeRequest = await tx.request.update({ where: { id: late.id }, data: { notificationVersion: { increment: 1 } } });
      await enqueueRequestNotification(tx, noticeRequest, `notification-smoke:${suffix}`, false);
      const notice = await tx.notificationOutbox.findUnique({ where: { id: `notification-smoke:${suffix}` } });
      assert.equal(notice.version, 1);
      assert.equal(notice.state, "QUEUED");
      assert.equal(notice.payload, null);
      const claimedNotice = await tx.notificationOutbox.update({ where: { id: notice.id, state: "QUEUED" }, data: { state: "IN_FLIGHT", attempts: { increment: 1 }, leaseToken: suffix } });
      assert.equal(claimedNotice.attempts, 1);
      await tx.notificationOutbox.update({ where: { id: notice.id, state: "IN_FLIGHT", leaseToken: suffix }, data: { state: "SENT", providerEmailId: suffix, sentAt: new Date(), leaseToken: null } });
      // Roll back every synthetic record. This verifies the actual generated
      // Prisma client and adapter, not mocked database methods.
      throw new RollbackSmoke();
    }, { timeout: 15_000 }), RollbackSmoke);
    assert.equal(await client.request.count({ where: { studentId: "migration_test_student" } }), 0);
    assert.equal(await client.notificationOutbox.count({ where: { id: `notification-smoke:${suffix}` } }), 0);
    await assert.rejects(client.request.update({
      where: { id: "migration-smoke-nonexistent", status: "PENDING_PAYMENT", paymentStatus: "UNPAID" },
      data: { status: "PROCESSING" },
    }), error => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025");
  } finally { await client.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const url = process.env.MIGRATION_TEST_DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) || new URL(url).pathname !== "/neu_arrs_migration_test") {
    throw new Error("Smoke CLI requires an explicit loopback neu_arrs_migration_test database.");
  }
  smokeMigratedDatabase(url).then(() => console.log("Prisma migration smoke checks passed (synthetic writes rolled back)."))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
