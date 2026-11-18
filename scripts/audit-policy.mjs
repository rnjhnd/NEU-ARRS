import { createHash } from "node:crypto";

const severities = ["info", "low", "moderate", "high", "critical"];
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

/** A nonzero npm process, registry error or unsupported report is never a pass. */
export function parseAuditOutput(output, exitCode) {
  requireCondition(exitCode === 0 || exitCode === 1, "npm audit did not complete successfully.");
  let report;
  try { report = JSON.parse(output.replace(/^\uFEFF/, "")); }
  catch { throw new Error("npm audit did not return valid JSON."); }
  validateReport(report);
  const count = Object.keys(report.vulnerabilities).length;
  requireCondition(exitCode === (count ? 1 : 0), "npm audit exit code contradicts its report.");
  return report;
}

function validateReport(report) {
  requireCondition(record(report) && !Object.hasOwn(report, "error") && report.auditReportVersion === 2,
    "Unsupported or failed npm audit report.");
  requireCondition(record(report.vulnerabilities) && record(report.metadata?.vulnerabilities), "Incomplete npm audit report.");
  const totals = Object.fromEntries(severities.map(severity => [severity, 0]));
  for (const [name, entry] of Object.entries(report.vulnerabilities)) {
    requireCondition(record(entry) && entry.name === name && severities.includes(entry.severity), "Malformed audit finding.");
    requireCondition(Array.isArray(entry.nodes) && entry.nodes.length > 0 && entry.nodes.every(node => typeof node === "string"), "Missing affected dependency nodes.");
    requireCondition(Array.isArray(entry.via) && entry.via.length > 0, "Missing advisory provenance.");
    totals[entry.severity]++;
  }
  for (const severity of severities) {
    requireCondition(report.metadata.vulnerabilities[severity] === totals[severity], "Audit severity totals are inconsistent.");
  }
  requireCondition(report.metadata.vulnerabilities.total === Object.keys(report.vulnerabilities).length, "Audit finding total is inconsistent.");
}

/** Policy is explicit input for tests; the CLI always reads the committed policy. */
export function evaluateAudit(full, production, lockfile, policy, now = Date.now()) {
  validateReport(full);
  validateReport(production);
  requireCondition(Object.keys(production.vulnerabilities).length === 0, "Production vulnerabilities block release; no exception applies.");
  const findings = Object.entries(full.vulnerabilities);
  if (!findings.length) return { excepted: false, findings: 0 };

  requireCondition(policy?.schemaVersion === 1 && policy.advisory === "GHSA-fc5q-39xc-vjpf" &&
    policy.url === "https://github.com/advisories/GHSA-fc5q-39xc-vjpf" &&
    policy.severity === "high" && policy.affectedRange === "<=4.0.7" &&
    policy.expiresAt === "2026-12-02T00:00:00.000Z", "Unrecognized audit exception policy.");
  const expiry = Date.parse(policy.expiresAt);
  requireCondition(Number.isFinite(now) && Number.isFinite(expiry) && now < expiry, "The approved audit exception has expired.");
  requireCondition(record(lockfile) && lockfile.lockfileVersion === 3 && record(lockfile.packages), "Unsupported lockfile.");
  const fingerprint = createHash("sha256").update(JSON.stringify(lockfile)).digest("hex");
  requireCondition(fingerprint === policy.lockfileSha256, "Dependency graph changed; the audit exception requires a new review.");
  requireCondition(Array.isArray(policy.nodes) && policy.nodes.length > 0, "Missing reviewed dependency nodes.");
  const reviewed = new Map();
  for (const node of policy.nodes) {
    requireCondition(record(node) && typeof node.path === "string" && typeof node.name === "string" && typeof node.version === "string" && !reviewed.has(node.path), "Invalid reviewed dependency node.");
    const installed = lockfile.packages[node.path];
    requireCondition(node.path.endsWith("node_modules/" + node.name) && Object.hasOwn(lockfile.packages, node.path) &&
      installed?.version === node.version && installed.dev === true, "Reviewed dependency is missing, changed or exposed in production.");
    reviewed.set(node.path, node);
  }
  for (const [name, entry] of findings) {
    requireCondition(entry.severity === policy.severity, "An unexpected advisory severity blocks release.");
    for (const path of entry.nodes) {
      requireCondition(reviewed.get(path)?.name === name, "An unreviewed dependency path blocks release.");
    }
  }

  const visiting = new Set(), verified = new Set();
  function verify(name) {
    requireCondition(!visiting.has(name), "A cyclic audit provenance graph blocks release.");
    if (verified.has(name)) return;
    requireCondition(Object.hasOwn(full.vulnerabilities, name), "An unresolved audit parent blocks release.");
    visiting.add(name);
    for (const cause of full.vulnerabilities[name].via) {
      if (typeof cause === "string") verify(cause);
      else requireCondition(name === "picomatch" && record(cause) && cause.name === "picomatch" && cause.dependency === "picomatch" &&
        cause.url === policy.url && cause.severity === policy.severity && cause.range === policy.affectedRange,
      "A new or changed advisory blocks release.");
    }
    visiting.delete(name);
    verified.add(name);
  }
  for (const [name] of findings) verify(name);
  return { excepted: true, findings: findings.length, advisory: policy.advisory, expiresAt: policy.expiresAt };
}
