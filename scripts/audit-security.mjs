import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { evaluateAudit, parseAuditOutput } from "./audit-policy.mjs";

async function audit(production) {
  const npm = process.env.npm_execpath;
  if (!npm || basename(npm) !== "npm-cli.js") throw new Error("Run this check through npm run audit:security.");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npm, "audit", "--json", ...(production ? ["--omit=dev"] : []), "--fetch-retries=1", "--fetch-timeout=30000"], {
      cwd: new URL("../", import.meta.url), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "", settled = false;
    const fail = message => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail("npm audit timed out; release remains blocked."), 120000);
    child.stdout.on("data", chunk => {
      output += chunk;
      if (output.length > 5_000_000) fail("npm audit output exceeded its limit.");
    });
    // Registry/CLI error text can contain local configuration. Fail without printing it.
    child.stderr.resume();
    child.once("error", () => fail("Could not start npm audit."));
    child.once("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { resolve(parseAuditOutput(output, code)); }
      catch (error) { reject(error); }
    });
  });
}

try {
  const [full, production, lockfile, policy] = await Promise.all([
    audit(false), audit(true),
    readFile(new URL("../package-lock.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./audit-exception.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  console.log("Complete npm audit report (including accepted residual findings):\n" + JSON.stringify(full, null, 2));
  console.log("Separate production-only npm audit report:\n" + JSON.stringify(production, null, 2));
  const result = evaluateAudit(full, production, lockfile, policy);
  if (result.excepted) console.warn(`APPROVED CONTROLLED-DEMO EXCEPTION: ${result.advisory}; ${result.findings} development-only entries; expires ${result.expiresAt}. This is not a zero-finding full audit.`);
  else console.log("Full and production-only audits report zero findings; no exception used.");
} catch (error) {
  console.error("Security audit failed: " + error.message);
  process.exitCode = 1;
}
