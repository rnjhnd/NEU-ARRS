# Temporary controlled-demo dependency audit exception

**Follow-up prepared locally November 19, 2026:** GitHub withdrew this advisory
on November 18. Fresh complete and production-only npm audits now report zero
findings for the unchanged lockfile. The exception, its December 2 deadline,
custom evaluator and exception-specific tests have been removed locally, restoring
the original strict audit command. See
[38-retire-withdrawn-advisory-exception.md](38-retire-withdrawn-advisory-exception.md).
This cleanup is local; publication remains pending. The remaining sections are
the historical record of the November 18 controlled-demo release.

The project owner explicitly approved this exception on November 18, 2026 while
releasing PR #11. It expires **December 2, 2026 at 00:00 UTC** and applies only to
the reviewed development-tool dependency graph. It is not approval for unrestricted
production use or for additional advisory exceptions.

## Finding and exposure

The complete audit reports 16 high-severity package entries that trace to one
advisory: [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).
The advisory concerns regular-expression denial of service from attacker-supplied
repeated-extglob patterns. It lists affected picomatch versions through 4.0.7 and
no patched release as of the review. Forcing npm's suggested toolchain downgrade
is not a verified remediation and was not performed.

All installed picomatch paths in the reviewed lockfile are development-only,
reached through ESLint/Vitest tooling. The separate production-only npm audit
reports zero findings. No application endpoint accepting glob patterns or direct
application import of these glob libraries was identified. This is an exposure
assessment, not proof that every vendored copy is immune: Next also contains a
compiled picomatch copy that npm's dependency audit does not independently assess.
No runtime framework, dependency version or lockfile was changed by this exception.

## Enforcement

`npm run audit:security` now runs `scripts/audit-security.mjs`. It independently
collects both the complete and production-only JSON reports, prints both valid
reports in full, then evaluates them with `scripts/audit-policy.mjs` and the
committed `scripts/audit-exception.json` policy.

The policy pins the exact advisory URL, severity, affected range, expiry, nineteen
reviewed package paths/versions, and a SHA-256 fingerprint of the parsed lockfile.
Parsing before hashing avoids platform line-ending differences; dependency graph
changes still require a new review. Every affected node must match the reviewed
package identity/version and retain `dev: true`. Every reported parent chain must
resolve exclusively to the accepted picomatch advisory.

The gate fails on:

- Any production-only finding, including the accepted advisory.
- A new advisory, changed severity/range, unknown package path/version, changed
  lockfile, production exposure, missing provenance or cyclic parent chain.
- Expiry while residual findings still require the exception.
- Registry/process errors, timeouts, invalid JSON, unsupported report formats,
  incomplete or inconsistent totals, and contradictory process exit codes.

Successful use prints an explicit **APPROVED CONTROLLED-DEMO EXCEPTION** warning
with the advisory ID and expiry. A complete audit with zero findings needs no
exception. The independent CI dependency-security job remains required; it has
not been replaced by a production-only audit or a severity threshold.

## Removal and verification

Once a compatible upstream remediation is available, review and update the graph,
remove the exception, and restore an uncompromised complete audit. Expiry is not
automatically extended. Retain the raw failed audit and approved assessment as
release evidence. Any further risk acceptance requires a separate review.

Thirty-one targeted tests cover accepted findings, unrelated and production findings,
graph/node changes, expiry, provenance failures, malformed reports and process
errors, including an attempted policy-only deadline extension. TypeScript, ESLint
and all 1,007 tests across 49 files passed. The evaluator accepted the saved real
reports and the actual npm command completed with its visible exception warning;
the independent production report remained empty. CI and hosted acceptance still
gate release. No dependency or lockfile version change was made.

The production Turbopack build and isolated cron/payment-namespace HTTP smoke
checks also passed. Their disposable database and synthetic provider credentials
do not access live records. The verification-only `.next` output is not deployed.
