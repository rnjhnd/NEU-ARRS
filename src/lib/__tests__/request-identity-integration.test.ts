import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient, type Prisma, type Request } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import prisma from "@/lib/prisma";
import { requireEmployeeOrAdmin, requireAdmin, AccessError } from "@/lib/auth";
import { reviewRequestIdentity } from "@/app/actions/identity.actions";
import { updateRequestStatus } from "@/app/actions/admin.actions";
import { checkoutPaidSchema, recordCheckoutPayment } from "../paymongo-webhook";
import { hasVerifiedRequestIdentity, identityReviewSelect } from "../request-identity";

let db: PGlite, socket: PGLiteSocketServer, client: PrismaClient, failAudit = false;
let sequence = 1;
beforeAll(async () => {
  db = await PGlite.create(); const root = resolve(process.cwd(), "prisma/migrations");
  for (const entry of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(await readFile(resolve(root, entry.name, "migration.sql"), "utf8"));
  socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 3 }); await socket.start();
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable`, max: 2 }) });
}, 60000);
afterAll(async () => { await client?.$disconnect(); await socket?.stop(); await db?.close(); });
beforeEach(() => {
  vi.resetAllMocks(); failAudit = false; vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(requireEmployeeOrAdmin).mockResolvedValue("synthetic_registrar"); vi.mocked(requireAdmin).mockResolvedValue("synthetic_admin");
  vi.mocked(prisma.auditLog.findUnique).mockImplementation(client.auditLog.findUnique.bind(client.auditLog));
  vi.mocked(prisma.$transaction).mockImplementation(async (callback, options) => client.$transaction(async tx => callback(new Proxy(tx, { get(target, key) {
    if (key === "auditLog" && failAudit) return new Proxy(target.auditLog, { get(audit, method) { return method === "create" ? async () => { throw new Error("Synthetic audit outage"); } : Reflect.get(audit, method); } });
    return Reflect.get(target, key);
  } }) as Prisma.TransactionClient), options));
});
afterEach(() => vi.restoreAllMocks());
const snapshot = (id: string) => client.request.findUniqueOrThrow({ where: { id }, include: { identityReview: { select: identityReviewSelect } } });
async function order(changes: Partial<Request> = {}) {
  return client.request.create({ data: { studentId: "synthetic_student", studentName: "Synthetic Student", studentNumber: "26-00001-001", documentType: "TOR", purpose: "PERSONAL",
    paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "PENDING_PAYMENT", quotedAmountCentavos: 15050, updatedAt: new Date("2026-11-12T00:00:00Z"),
    paymongoCheckoutId: "cs_identity" + sequence++, ...changes } });
}
function review(row: Request, decision = "verify") {
  const form = new FormData(); Object.entries({ requestId: row.id, expectedVersion: row.updatedAt.toISOString(), decision,
    recordsChecked: "true", reason: "Checked against synthetic school record TEST-001" }).forEach(([key, value]) => form.set(key, value)); return form;
}
function status(rows: Request[], next = "PROCESSING", override = false) {
  const form = new FormData(); rows.forEach(row => form.append("requestIds", row.id));
  Object.entries({ expectedVersions: JSON.stringify(rows.map(row => ({ id: row.id, updatedAt: row.updatedAt.toISOString() }))), newStatus: next,
    isOverride: String(override), overrideReason: "Synthetic registrar correction", confirmCashCollected: "true" }).forEach(([key, value]) => form.set(key, value)); return form;
}
function payment(row: Request) {
  return checkoutPaidSchema.parse({ id: row.paymongoCheckoutId, type: "checkout_session", attributes: { metadata: { requestId: row.id, studentId: row.studentId },
    payment_intent: { id: "pi_" + row.id, attributes: { amount: 15050, currency: "PHP", status: "succeeded" } },
    payments: [{ id: "pay_" + row.id, attributes: { amount: 15050, currency: "PHP", status: "paid", paid_at: 1794513600 } }] } });
}

it("keeps new identities unverified and blocks normal fulfillment plus administrator skips", async () => {
  const row = await order(); expect(hasVerifiedRequestIdentity(await snapshot(row.id))).toBe(false);
  const forged = status([row]); forged.set("identityVerified", "true");
  expect(await updateRequestStatus(forged)).toMatchObject({ success: false, error: expect.stringContaining("Registrar verification") });
  expect(await updateRequestStatus(status([row], "COMPLETED", true))).toMatchObject({ success: false, error: expect.stringContaining("Registrar verification") });
  expect((await snapshot(row.id)).status).toBe("PENDING_PAYMENT"); expect(await client.auditLog.count({ where: { requestId: row.id } })).toBe(0);
});
it("binds a registrar attestation to the exact request/account identity and immutable audit evidence", async () => {
  const row = await order(); expect(await reviewRequestIdentity(review(row))).toEqual({ success: true });
  const saved = await snapshot(row.id); expect(hasVerifiedRequestIdentity(saved)).toBe(true);
  expect(saved.updatedAt.getTime()).toBeGreaterThan(row.updatedAt.getTime());
  const proof = await client.auditLog.findUniqueOrThrow({ where: { id: saved.identityReview!.evidenceId } });
  expect(proof).toMatchObject({ action: "STUDENT_IDENTITY_VERIFIED", requestId: row.id, adminId: "synthetic_registrar" });
  expect(JSON.parse(proof.details)).toMatchObject({ source: "registrar_school_records", studentId: row.studentId, studentNumber: row.studentNumber });
  expect(await reviewRequestIdentity(review(row))).toMatchObject({ success: false });
  expect(await client.auditLog.count({ where: { requestId: row.id } })).toBe(1);
  expect(await updateRequestStatus(status([row]))).toMatchObject({ success: false, error: expect.stringContaining("Requests changed") });
  expect(await updateRequestStatus(status([saved]))).toMatchObject({ success: true });
});
it.each([401, 403] as const)("rejects unauthorized review (%i) before any database access", async code => {
  vi.mocked(requireEmployeeOrAdmin).mockRejectedValue(new AccessError(code));
  expect(await reviewRequestIdentity(new FormData())).toMatchObject({ success: false }); expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("forbids self-attestation, even if the actor is staff", async () => {
  const row = await order({ studentId: "synthetic_registrar" }); expect(await reviewRequestIdentity(review(row))).toMatchObject({ success: false, error: expect.stringContaining("own academic") });
  expect((await snapshot(row.id)).identityReview).toBeNull();
});
it.each(["recordsChecked", "expectedVersion", "reason", "decision"])("rejects invalid or duplicate %s fields", async key => {
  const row = await order(); const form = review(row); form.set(key, "invalid");
  expect(await reviewRequestIdentity(form)).toMatchObject({ success: false });
  const duplicate = review(row); duplicate.append(key, duplicate.get(key) as string); expect(await reviewRequestIdentity(duplicate)).toMatchObject({ success: false });
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it.each(["CANCELLED", "COMPLETED"] as const)("can record a current review on a %s request without rewriting historical status or dates", async state => {
  const row = await order({ status: state }); expect(await reviewRequestIdentity(review(row))).toMatchObject({ success: true });
  const saved = await snapshot(row.id); expect(saved.status).toBe(state); expect(saved.createdAt).toEqual(row.createdAt);
  expect(saved.identityReview!.verifiedAt.getTime()).toBeGreaterThan(row.updatedAt.getTime());
});
it("permits an authorized correction of an older completed online request after a current identity review", async () => {
  const row = await order({ status: "COMPLETED", paymentMethod: "online", paymentStatus: "PAID" });
  expect(await updateRequestStatus(status([row], "PROCESSING", true))).toMatchObject({ success: false });
  await reviewRequestIdentity(review(row)); expect(await updateRequestStatus(status([await snapshot(row.id)], "PROCESSING", true))).toMatchObject({ success: true });
});
it("rolls back a failed audit, including the request version", async () => {
  const row = await order(); failAudit = true; expect(await reviewRequestIdentity(review(row))).toMatchObject({ success: false });
  const saved = await snapshot(row.id); expect(saved.identityReview).toBeNull(); expect(saved.updatedAt).toEqual(row.updatedAt);
});
it("revokes verification atomically, keeps evidence and stops further fulfillment", async () => {
  const row = await order({ status: "PROCESSING" }); await reviewRequestIdentity(review(row)); const verified = await snapshot(row.id);
  const proofId = verified.identityReview!.evidenceId;
  expect(await reviewRequestIdentity(review(verified, "revoke"))).toEqual({ success: true });
  const revoked = await snapshot(row.id); expect(revoked.identityReview).toBeNull(); expect(revoked.status).toBe("PROCESSING");
  expect(await client.auditLog.findUnique({ where: { id: proofId } })).not.toBeNull();
  expect(await updateRequestStatus(status([verified], "READY_FOR_PICKUP"))).toMatchObject({ success: false });
  expect(await updateRequestStatus(status([revoked], "READY_FOR_PICKUP"))).toMatchObject({ success: false, error: expect.stringContaining("Registrar verification") });
  await reviewRequestIdentity(review(revoked)); expect(await updateRequestStatus(status([await snapshot(row.id)], "READY_FOR_PICKUP"))).toMatchObject({ success: true });
});
it.each(["studentId", "studentName", "studentNumber"] as const)("rejects a changed %s snapshot and never rolls a mixed batch forward partially", async field => {
  const one = await order(), two = await order(); await reviewRequestIdentity(review(one)); await reviewRequestIdentity(review(two));
  await client.request.update({ where: { id: two.id }, data: { [field]: "changed_synthetic_identity" } });
  const a = await snapshot(one.id), b = await snapshot(two.id); expect(hasVerifiedRequestIdentity(b)).toBe(false);
  expect(await updateRequestStatus(status([a, b]))).toMatchObject({ success: false }); expect((await snapshot(one.id)).status).toBe("PENDING_PAYMENT");
});
it("allows only one of two reviews of the same observed version", async () => {
  const row = await order(); const results = await Promise.all([reviewRequestIdentity(review(row)), reviewRequestIdentity(review(row))]);
  expect(results.filter(result => result.success)).toHaveLength(1); expect(await client.auditLog.count({ where: { requestId: row.id } })).toBe(1);
});
it("records an unverified student's payment once without advancing fulfillment, then permits reviewed processing", async () => {
  const row = await order({ paymentMethod: "online", paymentStatus: "UNPAID" });
  const event = "evt_identity" + row.id;
  expect(await recordCheckoutPayment(event, false, payment(row))).toMatchObject({ outcome: "applied" });
  const paid = await snapshot(row.id); expect(paid).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "PAID" });
  expect(await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.id } })).toMatchObject({ collectedCentavos: 15050 });
  expect(await recordCheckoutPayment(event, false, payment(row))).toMatchObject({ outcome: "duplicate" });
  await reviewRequestIdentity(review(paid)); expect(await updateRequestStatus(status([await snapshot(row.id)]))).toMatchObject({ success: true });
});
it("retains automatic paid-to-processing only when academic identity was reviewed", async () => {
  const row = await order({ paymentMethod: "online", paymentStatus: "UNPAID" }); await reviewRequestIdentity(review(row));
  expect(await recordCheckoutPayment("evt_verified" + row.id, false, payment(row))).toMatchObject({ outcome: "applied" });
  expect((await snapshot(row.id)).status).toBe("PROCESSING");
});
it("does not block cancellation or rewrite payment states when identity is unverified", async () => {
  const row = await order(); const form = status([row], "CANCELLED"); form.set("cancelReason", "Incorrect student details");
  expect(await updateRequestStatus(form)).toMatchObject({ success: true }); expect(await snapshot(row.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "CASH_ON_PICKUP" });
});
