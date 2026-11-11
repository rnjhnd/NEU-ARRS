import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import { Client } from "pg";
import { collectionFromAudit, moneyManifestSchema, refundFromAudit } from "../src/lib/monetary-evidence.ts";

/** Explicit evidence only. Dry runs are read-only; no providers or .env files. */
export async function reconcileMoney(client, input, { apply = false, actorId = "", now = new Date() } = {}) {
  const manifest = moneyManifestSchema.parse(input).sort((a, b) => a.requestId.localeCompare(b.requestId));
  if (apply && (typeof actorId !== "string" || actorId.trim().length < 3 || actorId.length > 255)) throw new Error("An explicit operator actor ID is required for apply.");
  await client.query(apply ? "BEGIN" : "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL lock_timeout = '5s'"); await client.query("SET LOCAL statement_timeout = '60s'");
    const ids = manifest.map(row => row.requestId);
    const { rows } = await client.query(`SELECT "id", to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt", "paymentMethod", "paymentStatus", "quotedAmountCentavos", "paymongoPaymentId", "paymongoCheckoutId" FROM "Request" WHERE "id" = ANY($1::text[]) ORDER BY "id" ${apply ? "FOR UPDATE" : ""}`, [ids]);
    if (rows.length !== ids.length) throw new Error("One or more requests do not exist.");
    const plans = [];
    const plannedReferences = new Set();
    for (const entry of manifest) {
      const order = rows.find(row => row.id === entry.requestId);
      const { rows: existingRows } = await client.query(`SELECT *, to_char("verifiedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "verifiedAt", to_char("paidAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "paidAt" FROM "RequestMoney" WHERE "requestId" = $1`, [entry.requestId]);
      const existing = existingRows[0];
      let evidence = existing;
      if (entry.collectionAuditId) {
        const { rows: audits } = await client.query(`SELECT *, to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM "AuditLog" WHERE "id" = $1`, [entry.collectionAuditId]);
        if (!audits[0]) throw new Error("Collection evidence not found.");
        evidence = collectionFromAudit(order, audits[0]);
      } else if (entry.cashReceipt) {
        if (order.paymentMethod !== "cash" || !["PAID", "CASH_ON_PICKUP", "REFUNDED"].includes(order.paymentStatus)) throw new Error("Cash evidence does not match the request.");
        if (entry.cashReceipt.paidAt && Date.parse(entry.cashReceipt.paidAt) > now.getTime()) throw new Error("Cash receipt date is in the future.");
        evidence = { method: "cash", collectedCentavos: entry.cashReceipt.amountCentavos, currency: "PHP", source: "HISTORICAL_VERIFIED",
          reference: "cash-receipt:" + createHash("sha256").update(entry.cashReceipt.reference).digest("hex"), paidAt: entry.cashReceipt.paidAt ?? null, verifiedAt: now,
          evidenceId: "money-cash:" + randomUUID() };
      }
      if (!evidence) throw new Error("Verified collection evidence is required; legacy values and quotes alone are not evidence.");
      if (plannedReferences.has(evidence.reference)) throw new Error("Duplicate payment/receipt references in the manifest.");
      plannedReferences.add(evidence.reference);
      if (existing && ["currency", "method", "collectedCentavos", "reference"].some(field => existing[field] !== evidence[field])) throw new Error("Canonical collection conflicts. Existing amounts were not overwritten.");
      if (existing?.paidAt && evidence.paidAt && new Date(existing.paidAt).getTime() !== new Date(evidence.paidAt).getTime()) throw new Error("Payment dates conflict; no date was overwritten.");
      const { rows: references } = await client.query('SELECT "requestId" FROM "RequestMoney" WHERE "reference"=$1 AND "requestId"<>$2', [evidence.reference, entry.requestId]);
      if (references.length) throw new Error("This receipt/payment is already assigned to another request.");
      let refund;
      if (entry.refundAuditId) {
        const { rows: audits } = await client.query(`SELECT *, to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM "AuditLog" WHERE "id" = $1`, [entry.refundAuditId]);
        if (!audits[0]) throw new Error("Refund evidence not found.");
        if (audits[0].action === "REFUND_SUCCEEDED") {
          const match = /^paymongo:(live|test):(pay_[a-zA-Z0-9]+)$/.exec(evidence.reference);
          const { rows: claims } = await client.query('SELECT * FROM "AuditLog" WHERE "id" = $1', [match ? `refund-claim:${match[1]}:${match[2]}` : "invalid"]);
          if (!claims[0]) throw new Error("Refund collection claim is missing.");
          const claimed = collectionFromAudit(order, claims[0]);
          if (claimed.reference !== evidence.reference || claimed.collectedCentavos !== evidence.collectedCentavos) throw new Error("Refund claim conflicts with collection evidence.");
        }
        refund = refundFromAudit(order, audits[0], evidence);
      }
      if (existing?.refundedCentavos != null && refund !== undefined && existing.refundedCentavos !== refund) throw new Error("Canonical refund conflicts; no overwrite is allowed.");
      const changes = !existing || (!existing.paidAt && Boolean(evidence.paidAt)) || (refund !== undefined && existing.refundedCentavos === null);
      if (changes && new Date(order.updatedAt).getTime() !== Date.parse(entry.expectedUpdatedAt)) throw new Error("Request changed. Rebuild the evidence manifest.");
      plans.push({ entry, evidence, existing, refund, changes });
    }
    if (apply) for (const plan of plans.filter(plan => plan.changes)) {
      const { entry, evidence, existing, refund } = plan;
      const auditId = "money-reconciled:" + randomUUID();
      if (entry.cashReceipt) await client.query('INSERT INTO "AuditLog" ("id", "adminId", "action", "details", "requestId") VALUES ($1,$2,\'MONEY_CASH_EVIDENCE_VERIFIED\',$3,$4)',
        [evidence.evidenceId, actorId.trim(), JSON.stringify({ source: "operator_verified_cash_receipt", ...entry.cashReceipt }), entry.requestId]);
      if (!existing) await client.query(`INSERT INTO "RequestMoney" ("requestId","currency","method","collectedCentavos","source","reference","evidenceId","verifiedAt","paidAt") VALUES ($1,'PHP',$2,$3,$4,$5,$6,$7,$8)`,
        [entry.requestId, evidence.method, evidence.collectedCentavos, evidence.source, evidence.reference, evidence.evidenceId, new Date(evidence.verifiedAt).toISOString(), evidence.paidAt]);
      else if (!existing.paidAt && evidence.paidAt) await client.query('UPDATE "RequestMoney" SET "paidAt"=$1 WHERE "requestId"=$2 AND "paidAt" IS NULL', [evidence.paidAt, entry.requestId]);
      if (refund !== undefined) await client.query('UPDATE "RequestMoney" SET "refundedCentavos"=$1,"refundEvidenceId"=$2,"refundVerifiedAt"=$3 WHERE "requestId"=$4 AND "refundedCentavos" IS NULL', [refund, entry.refundAuditId, now.toISOString(), entry.requestId]);
      await client.query('UPDATE "Request" SET "updatedAt"=GREATEST(CURRENT_TIMESTAMP,"updatedAt" + interval \'1 millisecond\') WHERE "id"=$1', [entry.requestId]);
      await client.query('INSERT INTO "AuditLog" ("id","adminId","action","details","requestId") VALUES ($1,$2,\'MONEY_RECONCILED\',$3,$4)',
        [auditId, actorId.trim(), JSON.stringify({ collectionEvidence: evidence.evidenceId, refundEvidence: entry.refundAuditId ?? null, previousUpdatedAt: entry.expectedUpdatedAt, legacyValuesPreserved: true }), entry.requestId]);
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return { applied: apply, changes: plans.filter(plan => plan.changes).length, unchanged: plans.filter(plan => !plan.changes).length };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}
async function main() {
  const { values } = parseArgs({ options: { file: { type: "string" }, actor: { type: "string" }, apply: { type: "boolean", default: false } } });
  if (!values.file || !process.env.MIGRATION_DATABASE_URL) throw new Error("Supply MIGRATION_DATABASE_URL explicitly and --file <verified-evidence.json> [--apply --actor <operator-id>].");
  if ((await stat(values.file)).size > 1024 * 1024) throw new Error("Evidence file exceeds 1 MiB.");
  const data = JSON.parse(await readFile(values.file, "utf8")); const client = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try { await client.connect(); console.log(JSON.stringify(await reconcileMoney(client, data, { apply: values.apply, actorId: values.actor }))); }
  finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
