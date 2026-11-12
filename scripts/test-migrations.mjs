import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { backfillRequestIdentities, validateIdentityMapping } from "./backfill-request-identities.mjs";
import { smokeMigratedDatabase } from "./smoke-migrations.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const initial = "20260608114857_init";
const expand = "20261111000100_expand_request_schema";
const contract = "20261111000200_contract_request_schema";
const checkout = "20261111000300_checkout_idempotency";
const cleanup = "20261111000400_cleanup_job_safety";
const notifications = "20261111000500_notification_outbox";
const history = "20261111000600_student_history_pagination";
const finance = "20261111000700_finance_period_index";
const money = "20261111000800_verified_money";
const currentMigrations = [initial, expand, contract, checkout, cleanup, notifications, history, finance, money, "20261112000100_role_change_recovery", "20261112000200_staff_queue_pagination"];
const migration = name => readFile(resolve(root, "prisma/migrations", name, "migration.sql"), "utf8");
const verifiedMapping = [{ studentId: "legacy_student", studentName: "Synthetic Student", studentNumber: "22-12345-123" }];
const native = process.argv.includes("--native");
if (process.argv.slice(2).some(argument => argument !== "--native")) throw new Error("Unknown migration-test option.");

// Default mode always starts owned, in-memory databases and ignores all ambient
// datasource variables. Native mode is explicit and only targets disposable CI.
async function withDatabase(check) {
  if (native) return withNativeDatabase(check);
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 10 });
  try {
    await server.start();
    const url = `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`;
    await check(db, url);
  } finally {
    await server.stop();
    await db.close();
  }
}

async function withNativeDatabase(check) {
  const value = process.env.MIGRATION_TEST_DATABASE_URL;
  if (!value) throw new Error("Native checks require MIGRATION_TEST_DATABASE_URL.");
  const base = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || base.pathname !== "/neu_arrs_migration_test") {
    throw new Error("Native checks require the dedicated loopback neu_arrs_migration_test database.");
  }
  // Never reset/drop the supplied database. Each scenario owns a newly named
  // database and may remove only that exact generated test database.
  const name = `neu_arrs_migration_test_${randomBytes(8).toString("hex")}`;
  const control = new Client({ connectionString: value });
  let client;
  let created = false;
  try {
    await control.connect();
    await control.query(`CREATE DATABASE "${name}"`);
    created = true;
    base.pathname = `/${name}`;
    client = new Client({ connectionString: base.href });
    await client.connect();
    await check({ query: client.query.bind(client), exec: client.query.bind(client) }, base.href);
  } finally {
    try {
      await client?.end();
      if (created && /^neu_arrs_migration_test_[a-f0-9]{16}$/.test(name)) await control.query(`DROP DATABASE "${name}"`);
    } finally { await control.end(); }
  }
}

async function prisma(args, url, expectedCode = 0) {
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ["node_modules/prisma/build/index.js", ...args, "--config", "scripts/prisma-test.config.ts"], {
      cwd: root, windowsHide: true,
      env: { ...process.env, MIGRATION_TEST_DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Disposable migration command exceeded 45 seconds.")); }, 45_000);
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => { clearTimeout(timer); resolveResult({ code, output }); });
  });
  assert.equal(result.code, expectedCode, result.output);
  return result.output;
}

async function expectNoDrift(url) {
  await prisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], url);
}

async function insertLegacyRows(client) {
  const cases = [
    ["legacy_paid_pending", "online", "PAID", "PENDING", 15000, "TOR"],
    ["legacy_cash_pending", "cash", "CASH_ON_PICKUP", "PENDING", 151, "GOOD_MORAL"],
    ["legacy_unpaid_pending", "online", "UNPAID", "PENDING", null, "DIPLOMA"],
    ["legacy_processing", "online", "PAID", "PROCESSING", 50000, "TOR"],
    ["legacy_ready", "online", "PAID", "READY_FOR_PICKUP", 100, "ENROLLMENT"],
    ["legacy_completed", "cash", "CASH_ON_PICKUP", "COMPLETED", 0, "DIPLOMA"],
    ["legacy_cancelled", "online", "UNPAID", "CANCELLED", null, "TOR"],
  ];
  for (const [id, method, payment, status, amount, document] of cases) {
    await client.query(`INSERT INTO "Request"
      ("id", "studentId", "documentType", "purpose", "paymentMethod", "paymentStatus", "status", "amountPaid",
       "paymongoCheckoutId", "paymongoPaymentId", "createdAt", "updatedAt")
      VALUES ($1, 'legacy_student', $2, 'PERSONAL', $3, $4, $5, $6, $7, $8, '2026-01-01', '2026-01-02')`,
    [id, document, method, payment, status, amount, `cs_${id}`, payment === "PAID" ? `pay_${id}` : null]);
  }
  return (await client.query('SELECT * FROM "Request" ORDER BY "id"')).rows;
}

const checks = [
  ["fresh database deploy, zero drift, actual Prisma CRUD, and repeat deploy", async () => {
    await withDatabase(async (client, url) => {
      await prisma(["migrate", "deploy"], url);
      await expectNoDrift(url);
      await smokeMigratedDatabase(url);
      await prisma(["migrate", "deploy"], url);
      const { rows } = await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name');
      assert.deepEqual(rows.map(row => row.migration_name), currentMigrations);
    });
  }],
  ["populated legacy upgrade refuses unknown identities, then preserves records after verified backfill", async () => {
    await withDatabase(async (client, url) => {
      await client.exec(await migration(initial));
      const before = await insertLegacyRows(client);
      if (native) {
        await prisma(["migrate", "resolve", "--applied", initial], url);
        assert.match(await prisma(["migrate", "deploy"], url, 1), /Verified student identity backfill required/);
      } else {
        await client.exec(await migration(expand));
        await assert.rejects(client.exec(await migration(contract)), /Verified student identity backfill required/);
        await client.exec("ROLLBACK");
      }
      assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM "Request" WHERE "status"::text = \'PENDING\'')).rows[0].count, 3);
      assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM "AuditLog"')).rows[0].count, 0);
      assert.deepEqual(await backfillRequestIdentities(client, verifiedMapping), { applied: false, requestCount: before.length });
      assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM "Request" WHERE "studentName" IS NULL')).rows[0].count, before.length);
      await assert.rejects(backfillRequestIdentities(client, []), /does not cover/);
      await backfillRequestIdentities(client, verifiedMapping, { apply: true, actorId: "migration_test_operator" });
      if (native) {
        await prisma(["migrate", "resolve", "--rolled-back", contract], url);
        await prisma(["migrate", "deploy"], url);
      } else {
        await client.exec(await migration(contract));
        await client.exec(await migration(checkout));
        await client.exec(await migration(cleanup));
        await client.exec(await migration(notifications));
        await client.exec(await migration(history));
        await client.exec(await migration(finance));
        await client.exec(await migration(money));
        await client.exec(await migration("20261112000100_role_change_recovery"));
        await client.exec(await migration("20261112000200_staff_queue_pagination"));
      }
      await expectNoDrift(url);
      const after = (await client.query('SELECT * FROM "Request" ORDER BY "id"')).rows;
      assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM "RequestMoney"')).rows[0].count, 0, "No collection may be inferred from legacy units or workflow state");
      assert.equal(after.length, before.length);
      for (let i = 0; i < before.length; i++) {
        for (const field of ["id", "studentId", "documentType", "paymentMethod", "paymentStatus", "amountPaid", "paymongoCheckoutId", "paymongoPaymentId", "createdAt"]) {
          assert.deepEqual(after[i][field], before[i][field], `Preserve ${field} for ${before[i].id}`);
        }
        assert.equal(after[i].status, before[i].status === "PENDING" ? "PENDING_PAYMENT" : before[i].status);
        assert.equal(after[i].studentName, verifiedMapping[0].studentName);
        assert.equal(after[i].studentNumber, verifiedMapping[0].studentNumber);
        assert.equal(after[i].submissionKey, null);
        assert.equal(after[i].quotedAmountCentavos, null);
      }
      const { rows: audits } = await client.query('SELECT * FROM "AuditLog" WHERE "action" = \'LEGACY_STATUS_MAPPED\'');
      assert.equal(audits.length, 3);
      assert.ok(audits.every(audit => JSON.parse(audit.details).fromStatus === "PENDING"));
      await smokeMigratedDatabase(url);
    });
  }],
  ["checkout identities, frozen payloads, foreign keys, and competing database leases", async () => {
    await withDatabase(async (client, url) => {
      for (const name of currentMigrations) await client.exec(await migration(name));
      const insert = `INSERT INTO "Request" ("id", "studentId", "studentName", "studentNumber", "documentType", "purpose", "paymentMethod", "updatedAt", "submissionKey", "quotedAmountCentavos")
        VALUES ($1, $2, 'Synthetic Student', '22-12345-123', 'TOR', 'PERSONAL', 'online', now(), $3, 15050)`;
      await client.query(insert, ["checkout_order", "student_a", "intent_uuid"]);
      await assert.rejects(client.query(insert, ["duplicate_order", "student_a", "intent_uuid"]), error => error.code === "23505");
      await client.query(insert, ["other_student_order", "student_b", "intent_uuid"]);
      await client.query(insert, ["legacy_order_a", "student_a", null]);
      await client.query(insert, ["legacy_order_b", "student_a", null]);
      const insertAttempt = `INSERT INTO "CheckoutAttempt" ("requestId", "idempotencyKey", "payload", "livemode", "credentialFingerprint", "leaseUntil")
        VALUES ($1, $2, '{"amount":15050}', false, 'synthetic', '1970-01-01')`;
      await client.query(insertAttempt, ["checkout_order", "provider_key"]);
      await assert.rejects(client.query(insertAttempt, ["checkout_order", "another_key"]), error => error.code === "23505");
      await assert.rejects(client.query(insertAttempt, ["other_student_order", "provider_key"]), error => error.code === "23505");
      await assert.rejects(client.query(insertAttempt, ["nonexistent", "missing_key"]), error => error.code === "23503");
      const refundClaim = `INSERT INTO "AuditLog" ("id", "adminId", "action", "details", "requestId") VALUES ('refund-claim:test:pay_sample', 'system:refunds', 'REFUND_SUBMISSION_CLAIMED', '{}', $1)`;
      await client.query(refundClaim, ["checkout_order"]);
      await assert.rejects(client.query(refundClaim, ["other_student_order"]), error => error.code === "23505");
      const insertNotice = `INSERT INTO "NotificationOutbox" ("id", "requestId", "version", "studentId", "status", "content", "updatedAt")
        VALUES ($1, $2, 1, 'student_a', 'CANCELLED', '{}', now())`;
      await client.query(insertNotice, ["notice_one", "checkout_order"]);
      await assert.rejects(client.query(insertNotice, ["notice_duplicate", "checkout_order"]), error => error.code === "23505");
      await assert.rejects(client.query(insertNotice, ["notice_missing", "missing_request"]), error => error.code === "23503");
      await assert.rejects(client.query('DELETE FROM "Request" WHERE "id" = $1', ["checkout_order"]), error => error.code === "23503");
      const contenders = [new Client({ connectionString: url }), new Client({ connectionString: url })];
      try {
        await Promise.all(contenders.map(connection => connection.connect()));
        const now = new Date();
        const claim = `UPDATE "CheckoutAttempt" SET "leaseUntil" = $1 WHERE "requestId" = 'checkout_order' AND "leaseUntil" <= $2`;
        const results = await Promise.all(contenders.map(connection => connection.query(claim, [new Date(now.getTime() + 30000), now])));
        assert.deepEqual(results.map(result => result.rowCount).sort(), [0, 1]);
        const stored = (await client.query('SELECT "idempotencyKey", "payload" FROM "CheckoutAttempt" WHERE "requestId" = \'checkout_order\'')).rows[0];
        assert.equal(stored.idempotencyKey, "provider_key");
        assert.deepEqual(stored.payload, { amount: 15050 });
        await client.query(`INSERT INTO "CronJobState" ("name", "leaseUntil", "updatedAt") VALUES ('cleanup-unpaid', '1970-01-01', now())`);
        const jobClaim = `UPDATE "CronJobState" SET "leaseUntil" = $1, "leaseToken" = $2 WHERE "name" = 'cleanup-unpaid' AND "leaseUntil" <= $3`;
        const jobResults = await Promise.all(contenders.map((connection, index) => connection.query(jobClaim, [new Date(now.getTime() + 120000), `worker-${index}`, now])));
        assert.deepEqual(jobResults.map(result => result.rowCount).sort(), [0, 1]);
        assert.equal((await client.query(`UPDATE "CronJobState" SET "leaseToken" = NULL WHERE "name" = 'cleanup-unpaid' AND "leaseToken" = 'stale-worker' RETURNING "name"`)).rows.length, 0);
        assert.equal((await client.query(`SELECT count(*)::int AS count FROM pg_indexes WHERE indexname = 'Request_cleanup_scan_idx'`)).rows[0].count, 1);
      } finally { await Promise.all(contenders.map(connection => connection.end())); }
    });
  }],
  ["backfill validates coverage/conflicts, preserves existing identity text, and is repeatable", async () => {
    await withDatabase(async client => {
      await client.exec(await migration(initial));
      await insertLegacyRows(client);
      await client.exec(await migration(expand));
      await client.query('UPDATE "Request" SET "studentName" = $1 WHERE "id" = $2', [" Synthetic Student ", "legacy_paid_pending"]);
      await assert.rejects(backfillRequestIdentities(client, [{ ...verifiedMapping[0], studentName: "Different Student" }], { apply: true, actorId: "operator" }), /conflicts/);
      assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM "AuditLog"')).rows[0].count, 0);
      await assert.rejects(backfillRequestIdentities(client, verifiedMapping, { apply: true }), /actor ID/);
      assert.throws(() => validateIdentityMapping([...verifiedMapping, ...verifiedMapping]), /Duplicate/);
      assert.throws(() => validateIdentityMapping([{ ...verifiedMapping[0], studentNumber: "unknown" }]), /Invalid/);
      await backfillRequestIdentities(client, verifiedMapping, { apply: true, actorId: "operator" });
      assert.equal((await client.query('SELECT "studentName" FROM "Request" WHERE "id" = $1', ["legacy_paid_pending"])).rows[0].studentName, " Synthetic Student ");
      assert.deepEqual(await backfillRequestIdentities(client, verifiedMapping, { apply: true, actorId: "operator" }), { applied: true, requestCount: 0 });
      await client.exec(await migration(contract));
    });
  }],
];

console.log(native ? "Migration checks use newly created disposable databases on loopback PostgreSQL." : "Migration checks use disposable in-memory PostgreSQL only.");
// Protect the already-applied migration's checksum against accidental editing.
assert.equal(createHash("sha256").update((await migration(initial)).replace(/\r\n/g, "\n")).digest("hex"),
  "7e6d366459476036d60934c857176e8ed513846490532764502ad3b1bb5595e0",
  "The original applied migration must remain unchanged.");
for (const [name, check] of checks) {
  const start = Date.now();
  await check();
  console.log(`PASS ${name} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
}
console.log(`All ${checks.length} migration scenarios passed.`);
