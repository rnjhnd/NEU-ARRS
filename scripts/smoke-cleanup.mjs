import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";

async function unusedPort() {
  const probe = createServer();
  probe.listen(0, "localhost");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((done, reject) => probe.close(error => error ? reject(error) : done()));
  return port;
}

async function withProductionServer(root, env, check) {
  const port = await unusedPort();
  // Match Next's normalized loopback hostname. Mixing 127.0.0.1 with
  // localhost can make a middleware continuation rewrite back into itself.
  const child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "localhost", "--port", String(port)], {
    cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  try {
    await new Promise((ready, reject) => {
      const timer = setTimeout(() => reject(new Error("Production smoke server did not become ready.")), 20_000);
      child.stdout.on("data", chunk => {
        output += chunk;
        if (/Ready in/.test(output)) { clearTimeout(timer); ready(); }
      });
      child.stderr.on("data", chunk => { output += chunk; });
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`Smoke server exited with ${code}.`)); });
    });
    await check(`http://localhost:${port}/api/cron/cleanup-unpaid`);
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "exit");
      child.kill();
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      try { await closed; } finally { clearTimeout(timer); }
    }
  }
}

/** Real HTTP dispatch against synthetic credentials and the owned empty DB. */
export async function smokePaymentNamespace({ root, env, db }) {
  assert.ok(env.PAYMONGO_SECRET_KEY.startsWith("sk_test_"));
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM "Request"')).rows[0].count, 0);
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM "AuditLog"')).rows[0].count, 0);
  const event = namespace => ({ data: { id: "evt_namespacehttp", type: "event", attributes: {
    type: "checkout_session.payment.paid", livemode: false, data: {
      id: "cs_namespacehttp", type: "checkout_session", attributes: {
        metadata: { requestId: "cm0x2a3bc000008mia76m2p2g", studentId: "user_synthetic", ...(namespace === undefined ? {} : { appNamespace: namespace }) },
        payment_intent: { id: "pi_namespacehttp", attributes: { amount: 15050, currency: "PHP", status: "succeeded" } },
        payments: [{ id: "pay_namespacehttp", attributes: { amount: 15050, currency: "PHP", status: "paid" } }],
      },
    },
  } } });
  const post = (url, payload, timestamp = Math.floor(Date.now() / 1000), validSignature = true) => {
    const body = JSON.stringify(payload);
    const digest = createHmac("sha256", env.PAYMONGO_WEBHOOK_SECRET).update(timestamp + "." + body).digest("hex");
    return fetch(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json", "Paymongo-Signature": `t=${timestamp},te=${validSignature ? digest : "0".repeat(64)},li=` }, body });
  };
  const noFinancialWrites = async () => {
    for (const table of ["Request", "AuditLog", "RequestMoney", "MoneyMovementDate", "RequestIdentityReview", "RequestCompletion", "NotificationOutbox"]) {
      assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM "' + table + '"')).rows[0].count, 0);
    }
  };
  for (const policy of [
    { PAYMONGO_NAMESPACE: "neu-arrs-demo", PAYMONGO_ACCEPT_LEGACY: "false", foreign: ["neu-arrs", undefined] },
    { PAYMONGO_NAMESPACE: "neu-arrs", PAYMONGO_ACCEPT_LEGACY: "true", foreign: ["neu-arrs-demo"] },
  ]) {
    await withProductionServer(root, { ...env, PAYMONGO_NAMESPACE: policy.PAYMONGO_NAMESPACE, PAYMONGO_ACCEPT_LEGACY: policy.PAYMONGO_ACCEPT_LEGACY }, async cleanupUrl => {
      const url = new URL("/api/webhooks/paymongo", cleanupUrl);
      for (const namespace of policy.foreign) {
        const response = await post(url, event(namespace)); assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { success: true, outcome: "ignored", reason: "foreign_namespace" });
      }
      assert.equal((await post(url, event(policy.foreign[0]), Math.floor(Date.now() / 1000), false)).status, 401);
      assert.equal((await post(url, event(policy.foreign[0]), Math.floor(Date.now() / 1000) - 301)).status, 401);
      await noFinancialWrites();
    });
  }
  await withProductionServer(root, { ...env, PAYMONGO_NAMESPACE: "" }, async cleanupUrl => {
    assert.equal((await post(new URL("/api/webhooks/paymongo", cleanupUrl), event("neu-arrs-demo"))).status, 503);
    await noFinancialWrites();
  });
  console.log("PASS production HTTP: signed foreign/unmarked events are isolated in both directions with no financial/audit writes; invalid/stale signatures 401 and missing namespace 503.");
}

/** Called only with the owned database/environment created by check-build.mjs. */
export async function smokeCleanup({ root, env, db }) {
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM "Request"')).rows[0].count, 0,
    "Cron smoke must have no requests, so no provider calls can run.");
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM "NotificationOutbox"')).rows[0].count, 0,
    "Notification smoke must have no messages, so no email provider calls can run.");
  const request = (url, headers = {}, method = "GET") => fetch(url, {
    headers, method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  await withProductionServer(root, env, async url => {
    assert.equal((await request(url)).status, 401);
    assert.equal((await request(url, { authorization: "Bearer synthetic_wrong_secret" })).status, 401);
    const headers = { authorization: `Bearer ${env.CRON_SECRET}` };
    assert.equal((await request(url, headers, "HEAD")).status, 405);
    const response = await request(url, headers);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert.equal(result.success, true);
    assert.equal(result.scanned, 0);
    assert.equal(result.cancelled, 0);
    const state = (await db.query('SELECT * FROM "CronJobState" WHERE "name" = \'cleanup-unpaid\'')).rows;
    assert.equal(state.length, 1);
    assert.equal(state[0].leaseToken, null);
    assert.equal(state[0].cursorId, null);
    assert.equal((await request(url, headers)).status, 200);
    const notificationsUrl = url.replace("cleanup-unpaid", "deliver-notifications");
    assert.equal((await request(notificationsUrl)).status, 401);
    assert.equal((await request(notificationsUrl, { authorization: "Bearer synthetic_wrong_secret" })).status, 401);
    assert.equal((await request(notificationsUrl, headers, "HEAD")).status, 405);
    const notifications = await request(notificationsUrl, headers);
    assert.equal(notifications.status, 200);
    assert.equal(notifications.headers.get("cache-control"), "no-store");
    assert.equal((await notifications.json()).processed, 0);
    assert.equal((await db.query('SELECT "leaseToken" FROM "CronJobState" WHERE "name" = \'deliver-notifications\'')).rows[0].leaseToken, null);
    console.log("PASS production HTTP: cleanup and notifications reject unauthorized requests, return empty 200 runs, and release database job leases; HEAD 405.");
  });
  await withProductionServer(root, { ...env, CRON_SECRET: "" }, async url => {
    assert.equal((await request(url, { authorization: "Bearer synthetic_wrong_secret" })).status, 503);
    assert.equal((await request(url.replace("cleanup-unpaid", "deliver-notifications"))).status, 503);
    console.log("PASS production HTTP: missing scheduler secret fails closed with 503.");
  });
}
