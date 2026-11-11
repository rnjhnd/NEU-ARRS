import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";

async function unusedPort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((done, reject) => probe.close(error => error ? reject(error) : done()));
  return port;
}

async function withProductionServer(root, env, check) {
  const port = await unusedPort();
  const child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
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
    await check(`http://127.0.0.1:${port}/api/cron/cleanup-unpaid`);
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
