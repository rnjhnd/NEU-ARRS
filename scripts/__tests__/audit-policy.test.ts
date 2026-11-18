import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateAudit, parseAuditOutput } from "../audit-policy.mjs";

const fingerprint = (lock: unknown) => createHash("sha256").update(JSON.stringify(lock)).digest("hex");
const now = Date.parse("2026-11-18T00:00:00Z");
const advisory = { name: "picomatch", dependency: "picomatch", url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf", severity: "high", range: "<=4.0.7" };
type Entry = { name: string; severity: string; nodes: string[]; via: (string | typeof advisory)[] };
function report(entries: Entry[] = []) {
  const counts: Record<string, number> = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: entries.length };
  for (const entry of entries) counts[entry.severity]++;
  return { auditReportVersion: 2, vulnerabilities: Object.fromEntries(entries.map(entry => [entry.name, entry])), metadata: { vulnerabilities: counts } };
}
function fixture() {
  const lock = { lockfileVersion: 3, packages: {
    "node_modules/picomatch": { version: "4.0.7", dev: true },
    "node_modules/tool": { version: "1.0.0", dev: true },
  } };
  const policy = { schemaVersion: 1, advisory: "GHSA-fc5q-39xc-vjpf", url: advisory.url, severity: "high", affectedRange: "<=4.0.7", expiresAt: "2026-12-02T00:00:00.000Z", lockfileSha256: fingerprint(lock), nodes: [
    { path: "node_modules/picomatch", name: "picomatch", version: "4.0.7" },
    { path: "node_modules/tool", name: "tool", version: "1.0.0" },
  ] };
  const full = report([
    { name: "picomatch", severity: "high", nodes: ["node_modules/picomatch"], via: [{ ...advisory }] },
    { name: "tool", severity: "high", nodes: ["node_modules/tool"], via: ["picomatch"] },
  ]);
  return { lock, policy, full, production: report() };
}

describe("controlled-demo audit exception", () => {
  it("accepts only the approved advisory's reviewed development nodes and parents", () => {
    const f = fixture();
    expect(evaluateAudit(f.full, f.production, f.lock, f.policy, now)).toEqual({ excepted: true, findings: 2, advisory: "GHSA-fc5q-39xc-vjpf", expiresAt: "2026-12-02T00:00:00.000Z" });
  });
  it("does not need an exception after the complete audit becomes clean", () => {
    const f = fixture();
    expect(evaluateAudit(report(), report(), f.lock, f.policy, Date.parse("2027-01-01"))).toEqual({ excepted: false, findings: 0 });
  });
  it.each(["2026-12-02T00:00:00.000Z", "2026-12-03T00:00:00.000Z"])("rejects residual findings at/after expiry (%s)", time => {
    const f = fixture(); expect(() => evaluateAudit(f.full, f.production, f.lock, f.policy, Date.parse(time))).toThrow("expired");
  });
  it("cannot extend the approved deadline by changing the policy file alone", () => {
    const f = fixture(); f.policy.expiresAt = "2027-01-01T00:00:00.000Z";
    expect(() => evaluateAudit(f.full, f.production, f.lock, f.policy, now)).toThrow("Unrecognized");
  });
  it("rejects production findings even when the same advisory is approved for tooling", () => {
    const f = fixture(); expect(() => evaluateAudit(f.full, f.full, f.lock, f.policy, now)).toThrow("Production");
  });
  it("rejects an unrelated dependency graph change", () => {
    const f = fixture(); f.lock.lockfileVersion = 2;
    expect(() => evaluateAudit(f.full, f.production, f.lock, f.policy, now)).toThrow("lockfile");
    f.lock.lockfileVersion = 3; f.lock.packages["node_modules/tool"].version = "1.0.1";
    expect(() => evaluateAudit(f.full, f.production, f.lock, f.policy, now)).toThrow("graph changed");
  });
  it.each(["production", "version", "missing"])("rejects reviewed nodes whose installed state is %s even with a matching fingerprint", change => {
    const f = fixture();
    if (change === "production") f.lock.packages["node_modules/picomatch"].dev = false;
    else if (change === "version") f.lock.packages["node_modules/picomatch"].version = "4.0.8";
    else Reflect.deleteProperty(f.lock.packages, "node_modules/picomatch");
    f.policy.lockfileSha256 = fingerprint(f.lock);
    expect(() => evaluateAudit(f.full, f.production, f.lock, f.policy, now)).toThrow("missing, changed or exposed");
  });
  it("rejects unreviewed affected paths", () => {
    const f = fixture(); f.full.vulnerabilities.picomatch.nodes.push("node_modules/other/node_modules/picomatch");
    expect(() => evaluateAudit(f.full, f.production, f.lock, f.policy, now)).toThrow("unreviewed");
  });
  it.each(["url", "range", "dependency", "severity"])("rejects changed advisory %s", field => {
    const f = fixture(); const cause = f.full.vulnerabilities.picomatch.via[0];
    if (typeof cause !== "string") Reflect.set(cause, field, "unapproved");
    expect(() => evaluateAudit(f.full, f.production, f.lock, f.policy, now)).toThrow("changed advisory");
  });
  it("rejects a second advisory instead of suppressing a whole package", () => {
    const f = fixture(); f.full.vulnerabilities.picomatch.via.push({ ...advisory, url: "https://github.com/advisories/GHSA-another-issue-here" });
    expect(() => evaluateAudit(f.full, f.production, f.lock, f.policy, now)).toThrow("changed advisory");
  });
  it("rejects lower-severity unrelated findings too", () => {
    const f = fixture(); f.full.vulnerabilities.tool.severity = "low"; f.full.metadata.vulnerabilities.high--; f.full.metadata.vulnerabilities.low++;
    expect(() => evaluateAudit(f.full, f.production, f.lock, f.policy, now)).toThrow("unexpected advisory severity");
  });
  it("rejects unresolved and cyclic parent chains", () => {
    const f = fixture(); f.full.vulnerabilities.tool.via = ["missing"];
    expect(() => evaluateAudit(f.full, f.production, f.lock, f.policy, now)).toThrow("unresolved");
    f.full.vulnerabilities.tool.via = ["picomatch", "tool"];
    expect(() => evaluateAudit(f.full, f.production, f.lock, f.policy, now)).toThrow("cyclic");
  });
  it("rejects leaf advisories attached to an unreviewed package identity", () => {
    const f = fixture(); f.full.vulnerabilities.tool.via = [{ ...advisory }];
    expect(() => evaluateAudit(f.full, f.production, f.lock, f.policy, now)).toThrow("changed advisory");
  });
  it("pins the real reviewed graph and development-only package versions", () => {
    const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
    const policy = JSON.parse(readFileSync(new URL("../audit-exception.json", import.meta.url), "utf8"));
    expect(policy.expiresAt).toBe("2026-12-02T00:00:00.000Z");
    expect(policy.lockfileSha256).toBe(fingerprint(lock));
    expect(policy.nodes).toHaveLength(19);
    for (const node of policy.nodes) expect(lock.packages[node.path]).toMatchObject({ version: node.version, dev: true });
  });
});

describe("fail-closed npm report handling", () => {
  it("accepts complete successful and vulnerable npm JSON with matching exit codes", () => {
    expect(parseAuditOutput(JSON.stringify(report()), 0)).toEqual(report());
    const f = fixture(); expect(parseAuditOutput(JSON.stringify(f.full), 1)).toEqual(f.full);
  });
  it.each(["", "not JSON", "null", "[]", '{"error":{"code":"ENETUNREACH"}}', '{"auditReportVersion":3,"vulnerabilities":{}}'])("rejects failed or unsupported output: %s", output => {
    expect(() => parseAuditOutput(output, 1)).toThrow();
  });
  it.each([null, 2, 127])("rejects failed/signalled processes (%s)", code => {
    expect(() => parseAuditOutput(JSON.stringify(report()), code)).toThrow("did not complete");
  });
  it("rejects contradictory exit codes, totals, empty provenance and missing nodes", () => {
    const f = fixture();
    expect(() => parseAuditOutput(JSON.stringify(f.full), 0)).toThrow("contradicts");
    expect(() => parseAuditOutput(JSON.stringify(report()), 1)).toThrow("contradicts");
    f.full.metadata.vulnerabilities.total = 0;
    expect(() => parseAuditOutput(JSON.stringify(f.full), 1)).toThrow("total");
    f.full.metadata.vulnerabilities.total = 2; f.full.vulnerabilities.tool.via = [];
    expect(() => parseAuditOutput(JSON.stringify(f.full), 1)).toThrow("provenance");
    f.full.vulnerabilities.tool.via = ["picomatch"]; f.full.vulnerabilities.tool.nodes = [];
    expect(() => parseAuditOutput(JSON.stringify(f.full), 1)).toThrow("nodes");
  });
});
