import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient, type Request } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client as PgClient } from "pg";
import prisma from "@/lib/prisma";
import { requireAdmin, requireEmployeeOrAdmin } from "@/lib/auth";
import { recordCheckoutPayment, checkoutPaidSchema } from "../paymongo-webhook";
import { recordFullRefund } from "../monetary-ledger";
import { updateRequestStatus } from "@/app/actions/admin.actions";
import { reconcileMoney } from "../../../scripts/reconcile-money.mjs";
import { finishCancellationRefunds } from "../cancellation-refunds";

let db: PGlite, socket: PGLiteSocketServer, client: PrismaClient, sql: PgClient;
let serial = 1;
const originalVersion = new Date("2026-11-01T00:00:00Z");
beforeAll(async () => {
  db = await PGlite.create(); const root = resolve(process.cwd(), "prisma/migrations");
  for (const entry of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(await readFile(resolve(root, entry.name, "migration.sql"), "utf8"));
  socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 3 }); await socket.start();
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable`, max: 2 }) });
  sql = new PgClient({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable` }); await sql.connect();
}, 60000);
afterAll(async () => { await sql?.end(); await client?.$disconnect(); await socket?.stop(); await db?.close(); });
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(requireAdmin).mockResolvedValue("synthetic_admin"); vi.mocked(requireEmployeeOrAdmin).mockResolvedValue("synthetic_staff");
  vi.mocked(prisma.$transaction).mockImplementation(async callback => client.$transaction(callback));
  vi.mocked(prisma.auditLog.findUnique).mockImplementation(client.auditLog.findUnique.bind(client.auditLog));
  vi.mocked(prisma.request.findUnique).mockImplementation(client.request.findUnique.bind(client.request));
});
afterEach(() => vi.unstubAllEnvs());
async function order(overrides: Partial<Request> = {}) {
  return client.request.create({ data: { id: "c" + String(serial++).padStart(24, "0"), studentId: "synthetic_student", studentName: "Synthetic", studentNumber: "22-12345-123", documentType: "TOR", purpose: "PERSONAL",
    paymentMethod: "online", paymentStatus: "UNPAID", status: "PENDING_PAYMENT", paymongoCheckoutId: "cs_synthetic" + serial, quotedAmountCentavos: 15050,
    amountPaid: 151, createdAt: originalVersion, updatedAt: originalVersion, ...overrides } });
}
function checkout(row: Request) {
  return checkoutPaidSchema.parse({ id: row.paymongoCheckoutId, type: "checkout_session", attributes: { metadata: { requestId: row.id, studentId: row.studentId }, livemode: false,
    payment_intent: { id: "pi_" + row.id, attributes: { amount: 15050, currency: "PHP", status: "succeeded", livemode: false } },
    payments: [{ id: "pay_" + row.id, attributes: { amount: 15050, currency: "PHP", status: "paid", payment_intent_id: "pi_" + row.id, paid_at: Date.parse("2026-11-01T00:00:00Z") / 1000 } }] } });
}
async function receipt(row: Request) {
  const payment = row.paymongoPaymentId!;
  return client.auditLog.create({ data: { id: "paymongo:test:evt_" + row.id, adminId: "system:paymongo", requestId: row.id, action: "PAYMONGO_PAYMENT_RECORDED",
    details: JSON.stringify({ source: "signed_webhook", outcome: "applied", currency: "PHP", livemode: false, checkoutId: row.paymongoCheckoutId, paymentIds: [payment], amountCentavos: 15050, providerIntentAmountCentavos: 15050 }) } });
}
function completion(rows: Request[]) { const form = new FormData(); rows.forEach(row => form.append("requestIds", row.id)); form.set("expectedVersions", JSON.stringify(rows.map(row => ({ id: row.id, updatedAt: row.updatedAt.toISOString() })))); form.set("newStatus", "COMPLETED"); form.set("confirmCashCollected", "true"); return form; }

it("atomically records exact online centavos and paid-at evidence, preserves legacy data, and deduplicates replays", async () => {
  const row = await order(); const paid = checkout(row);
  expect(await recordCheckoutPayment("evt_money" + row.id, false, paid)).toMatchObject({ outcome: "applied" });
  const money = await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.id } });
  expect(money).toMatchObject({ collectedCentavos: 15050, currency: "PHP", source: "PAYMONGO_PAYMENT", refundedCentavos: null });
  expect(money.paidAt?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  expect((await client.request.findUniqueOrThrow({ where: { id: row.id } })).amountPaid).toBe(151);
  expect(await recordCheckoutPayment("evt_money" + row.id, false, paid)).toMatchObject({ outcome: "duplicate" });
  expect(await recordCheckoutPayment("evt_other" + row.id, false, paid)).toMatchObject({ outcome: "already_recorded" });
  expect(await client.requestMoney.count({ where: { requestId: row.id } })).toBe(1);
});
it("rolls back payment/workflow/audit changes if canonical money conflicts", async () => {
  const row = await order(); const proof = await client.auditLog.create({ data: { adminId: "synthetic", action: "CONFLICT_FIXTURE", details: "{}", requestId: row.id } });
  await client.requestMoney.create({ data: { requestId: row.id, currency: "PHP", method: "online", collectedCentavos: 16000, source: "PAYMONGO_PAYMENT", reference: "paymongo:test:pay_" + row.id, evidenceId: proof.id } });
  await expect(recordCheckoutPayment("evt_conflict" + row.id, false, checkout(row))).rejects.toThrow("conflicts");
  expect((await client.request.findUniqueOrThrow({ where: { id: row.id } })).paymentStatus).toBe("UNPAID");
  expect(await client.auditLog.count({ where: { id: "paymongo:test:evt_conflict" + row.id } })).toBe(0);
});
it.each([0, 15050])("records a cash collection of %s centavos only with completion confirmation", async amount => {
  const row = await order({ paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "READY_FOR_PICKUP", quotedAmountCentavos: amount, paymongoCheckoutId: null, amountPaid: null });
  expect(await client.requestMoney.count({ where: { requestId: row.id } })).toBe(0);
  expect(await updateRequestStatus(completion([row]))).toMatchObject({ success: true });
  const money = await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.id } });
  expect(money).toMatchObject({ collectedCentavos: amount, source: "CASH_CONFIRMATION", paidAt: null });
});
it("rolls back an entire cash batch instead of guessing a missing historical amount", async () => {
  const known = await order({ paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "READY_FOR_PICKUP", paymongoCheckoutId: null });
  const unknown = await order({ paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "READY_FOR_PICKUP", quotedAmountCentavos: null, amountPaid: 15000, paymongoCheckoutId: null });
  expect(await updateRequestStatus(completion([known, unknown]))).toMatchObject({ success: false });
  expect(await client.requestMoney.count({ where: { requestId: { in: [known.id, unknown.id] } } })).toBe(0);
  expect((await client.request.findUniqueOrThrow({ where: { id: known.id } })).status).toBe("READY_FOR_PICKUP");
  expect((await client.request.findUniqueOrThrow({ where: { id: unknown.id } })).amountPaid).toBe(15000);
});
it("records only a matching confirmed full refund and rolls back a mismatched refund", async () => {
  const row = await order(); await recordCheckoutPayment("evt_refund" + row.id, false, checkout(row));
  const change = async (amount: number) => client.$transaction(async tx => {
    await tx.request.update({ where: { id: row.id }, data: { status: "CANCELLED", paymentStatus: "REFUNDED" } });
    const audit = await tx.auditLog.create({ data: { adminId: "synthetic", action: "REFUND_SUCCEEDED", requestId: row.id, details: "{}" } });
    await recordFullRefund(tx, row.id, amount, audit.id);
  });
  await expect(change(15000)).rejects.toThrow("does not match");
  expect((await client.request.findUniqueOrThrow({ where: { id: row.id } })).paymentStatus).toBe("PAID");
  await change(15050);
  expect((await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.id } })).refundedCentavos).toBe(15050);
});
it("persists provider collection evidence before a refund POST and commits the confirmed refund atomically", async () => {
  const row = await order({ status: "CANCELLED", paymentStatus: "PAID", paymongoPaymentId: "pay_refundflow" });
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_synthetic_money");
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ data: { id: row.paymongoPaymentId, attributes: { amount: 15050, currency: "PHP", status: "paid", refunds: [] } } }))
    .mockImplementationOnce(async () => {
      expect(await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.id } })).toMatchObject({ collectedCentavos: 15050, reference: "paymongo:test:pay_refundflow", refundedCentavos: null });
      return Response.json({ data: { id: "ref_confirmed", attributes: { amount: 15050, currency: "PHP", status: "succeeded", payment_id: row.paymongoPaymentId } } });
    });
  expect(await finishCancellationRefunds([row], "synthetic_staff", "Cancelled by owner")).toEqual({ reviewIds: [], refundedIds: [row.id] });
  expect((await client.request.findUniqueOrThrow({ where: { id: row.id } })).paymentStatus).toBe("REFUNDED");
  expect(await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.id } })).toMatchObject({ collectedCentavos: 15050, refundedCentavos: 15050, paidAt: null });
});
it("rolls back a refund claim and sends no POST when canonical collection conflicts with the provider", async () => {
  const row = await order({ status: "CANCELLED", paymentStatus: "PAID", paymongoPaymentId: "pay_refundconflict" });
  const evidence = await receipt(row);
  await client.requestMoney.create({ data: { requestId: row.id, method: "online", collectedCentavos: 16000, source: "PAYMONGO_PAYMENT", reference: "paymongo:test:pay_refundconflict", evidenceId: evidence.id } });
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_synthetic_money");
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ data: { id: row.paymongoPaymentId, attributes: { amount: 15050, currency: "PHP", status: "paid", refunds: [] } } }));
  expect(await finishCancellationRefunds([row], "synthetic_staff", "Cancelled by owner")).toEqual({ reviewIds: [row.id], refundedIds: [] });
  expect(fetch).toHaveBeenCalledOnce();
  expect(await client.auditLog.count({ where: { id: "refund-claim:test:pay_refundconflict" } })).toBe(0);
  expect((await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.id } })).collectedCentavos).toBe(16000);
});
it("enforces currency, centavo and evidence constraints in PostgreSQL", async () => {
  const row = await order(); const audit = await receipt({ ...row, paymongoPaymentId: "pay_constraint" });
  const input = { requestId: row.id, method: "online", collectedCentavos: 15050, currency: "PHP", source: "PAYMONGO_PAYMENT" as const, reference: "constraint:" + row.id, evidenceId: audit.id };
  await expect(client.requestMoney.create({ data: { ...input, currency: "USD" } })).rejects.toThrow();
  await expect(client.requestMoney.create({ data: { ...input, collectedCentavos: -1 } })).rejects.toThrow();
  await expect(client.requestMoney.create({ data: { ...input, evidenceId: "missing_evidence" } })).rejects.toThrow();
});
it("reconciles historical audited evidence with a read-only preview and repeatable apply, preserving legacy values", async () => {
  const row = await order({ paymentStatus: "PAID", paymongoPaymentId: "pay_historical", quotedAmountCentavos: null, amountPaid: 15050 }); const audit = await receipt(row);
  const manifest = [{ requestId: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), collectionAuditId: audit.id }];
  expect(await reconcileMoney(sql, manifest)).toMatchObject({ applied: false, changes: 1 });
  expect(await client.requestMoney.count({ where: { requestId: row.id } })).toBe(0);
  expect(await reconcileMoney(sql, manifest, { apply: true, actorId: "verified_operator" })).toMatchObject({ applied: true, changes: 1 });
  expect(await reconcileMoney(sql, manifest, { apply: true, actorId: "verified_operator" })).toMatchObject({ changes: 0, unchanged: 1 });
  expect((await client.request.findUniqueOrThrow({ where: { id: row.id } })).amountPaid).toBe(15050);
  expect((await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.id } })).collectedCentavos).toBe(15050);
});
it("accepts an explicitly verified historical zero cash receipt without inventing a payment date", async () => {
  const row = await order({ paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "COMPLETED", quotedAmountCentavos: null, amountPaid: 15000 });
  await reconcileMoney(sql, [{ requestId: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), cashReceipt: { reference: "OR-zero-" + row.id, amountCentavos: 0, currency: "PHP", note: "Verified free-document receipt" } }], { apply: true, actorId: "verified_operator" });
  expect(await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.id } })).toMatchObject({ collectedCentavos: 0, paidAt: null, source: "HISTORICAL_VERIFIED" });
});
it("rejects stale, mismatched and duplicate receipt evidence before any batch write", async () => {
  const a = await order({ paymentStatus: "PAID", paymongoPaymentId: "pay_stale" }); const audit = await receipt(a);
  await expect(reconcileMoney(sql, [{ requestId: a.id, expectedUpdatedAt: "2020-01-01T00:00:00Z", collectionAuditId: audit.id }], { apply: true, actorId: "operator" })).rejects.toThrow("changed");
  const b = await order({ paymentStatus: "PAID", paymongoPaymentId: "pay_other" });
  await expect(reconcileMoney(sql, [{ requestId: a.id, expectedUpdatedAt: a.updatedAt.toISOString(), collectionAuditId: audit.id }, { requestId: b.id, expectedUpdatedAt: b.updatedAt.toISOString(), collectionAuditId: audit.id }], { apply: true, actorId: "operator" })).rejects.toThrow("different request");
  expect(await client.requestMoney.count({ where: { requestId: { in: [a.id, b.id] } } })).toBe(0);
});
it("does not apply without an operator, infer collections from quotes, or partially apply a batch", async () => {
  const known = await order({ paymentStatus: "PAID", paymongoPaymentId: "pay_batch" }); const audit = await receipt(known);
  const unknown = await order({ paymentStatus: "PAID", quotedAmountCentavos: 15050, amountPaid: 15050 });
  const manifest = [{ requestId: known.id, expectedUpdatedAt: known.updatedAt.toISOString(), collectionAuditId: audit.id }];
  await expect(reconcileMoney(sql, manifest, { apply: true })).rejects.toThrow("operator");
  await expect(reconcileMoney(sql, [...manifest, { requestId: unknown.id, expectedUpdatedAt: unknown.updatedAt.toISOString() }], { apply: true, actorId: "operator" })).rejects.toThrow("evidence is required");
  expect(await client.requestMoney.count({ where: { requestId: { in: [known.id, unknown.id] } } })).toBe(0);
});
it("rejects assigning one cash receipt to two orders, within a batch and across later runs", async () => {
  const a = await order({ paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "COMPLETED" });
  const b = await order({ paymentMethod: "cash", paymentStatus: "CASH_ON_PICKUP", status: "COMPLETED" });
  const cashReceipt = { reference: "OR-duplicate-receipt", amountCentavos: 15050, currency: "PHP", note: "Verified original paper receipt" };
  const manifest = [a, b].map(row => ({ requestId: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), cashReceipt }));
  await expect(reconcileMoney(sql, manifest, { apply: true, actorId: "operator" })).rejects.toThrow("Duplicate");
  expect(await client.requestMoney.count({ where: { requestId: { in: [a.id, b.id] } } })).toBe(0);
  await reconcileMoney(sql, [manifest[0]], { apply: true, actorId: "operator" });
  await expect(reconcileMoney(sql, [manifest[1]], { apply: true, actorId: "operator" })).rejects.toThrow("already assigned");
  expect(await client.requestMoney.count({ where: { requestId: b.id } })).toBe(0);
});
it("backfills a full refund only with its successful audit and correlated collection claim", async () => {
  const row = await order({ status: "CANCELLED", paymentStatus: "REFUNDED", paymongoPaymentId: "pay_refundhistory", quotedAmountCentavos: null });
  const collection = await receipt(row);
  const refund = await client.auditLog.create({ data: { adminId: "operator", action: "REFUND_SUCCEEDED", requestId: row.id, details: JSON.stringify({ confirmed: true, refund: { status: "succeeded", refundId: "ref_historical", amountCentavos: 15050 } }) } });
  const manifest = [{ requestId: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), collectionAuditId: collection.id, refundAuditId: refund.id }];
  await expect(reconcileMoney(sql, manifest, { apply: true, actorId: "operator" })).rejects.toThrow("claim is missing");
  expect(await client.requestMoney.count({ where: { requestId: row.id } })).toBe(0);
  await client.auditLog.create({ data: { id: "refund-claim:test:pay_refundhistory", adminId: "system:paymongo", action: "REFUND_SUBMISSION_CLAIMED", requestId: row.id, details: JSON.stringify({ paymentId: "pay_refundhistory", amountCentavos: 15050 }) } });
  await reconcileMoney(sql, manifest, { apply: true, actorId: "operator" });
  expect(await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.id } })).toMatchObject({ collectedCentavos: 15050, refundedCentavos: 15050, refundEvidenceId: refund.id, paidAt: null });
  expect(await reconcileMoney(sql, manifest, { apply: true, actorId: "operator" })).toMatchObject({ changes: 0, unchanged: 1 });
});
it("enriches an unknown payment date from verified evidence without overwriting known dates or money", async () => {
  const row = await order({ paymentStatus: "PAID", paymongoPaymentId: "pay_date" }); const original = await receipt(row);
  const entry = { requestId: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), collectionAuditId: original.id };
  await reconcileMoney(sql, [entry], { apply: true, actorId: "operator" });
  const current = await client.request.findUniqueOrThrow({ where: { id: row.id } });
  const money = await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.id } });
  const details = JSON.parse(original.details);
  const dated = await client.auditLog.create({ data: { ...original, id: original.id + "dated", details: JSON.stringify({ ...details, paidAt: "2026-11-01T00:00:00Z" }) } });
  await reconcileMoney(sql, [{ ...entry, expectedUpdatedAt: current.updatedAt.toISOString(), collectionAuditId: dated.id }], { apply: true, actorId: "operator" });
  expect(await client.requestMoney.findUniqueOrThrow({ where: { requestId: row.id } })).toMatchObject({ collectedCentavos: money.collectedCentavos, verifiedAt: money.verifiedAt, paidAt: new Date("2026-11-01T00:00:00Z") });
  const conflict = await client.auditLog.create({ data: { ...original, id: original.id + "conflict", details: JSON.stringify({ ...details, paidAt: "2026-11-02T00:00:00Z" }) } });
  await expect(reconcileMoney(sql, [{ ...entry, collectionAuditId: conflict.id }], { apply: true, actorId: "operator" })).rejects.toThrow("dates conflict");
});
