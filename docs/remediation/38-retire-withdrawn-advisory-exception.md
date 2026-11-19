# Retire the withdrawn picomatch advisory exception

Prepared locally on November 19, 2026, on top of release `7872b04`. This follow-up
has not been pushed or deployed.

## Evidence and decision

GitHub now marks [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
as withdrawn on November 18, 2026. Its upstream reference points to the
[maintainer discussion](https://github.com/micromatch/picomatch/pull/235)
disputing the vulnerability classification and advising against allowing
untrusted users to define glob/regular-expression patterns. The proposed patch
was closed without merging; this change does not represent a patched library
release or claim that arbitrary patterns cannot cause expensive matching.

Fresh complete and production-only `npm audit --json` reports both returned exit
code zero and zero findings for the existing lockfile. No package upgrade,
downgrade, vendored patch, version override or new exception is needed to clear
this withdrawn advisory. No dependency versions or application code changed.

## Cleanup

`npm run audit:security` again runs `npm audit --audit-level=low`, covering both
runtime and development dependencies. The independent required CI audit job is
unchanged and continues to fail for reported low, moderate, high or critical
findings and audit command errors. No advisory is allowlisted.

Removed the obsolete exception JSON, evaluator, wrapper and 31 tests dedicated
to accepting/rejecting that exception. Application security and data tests remain
in place. The old exception report is retained as history with a follow-up notice.
There is no longer an active December 2 deadline in the local audit configuration.
The GitHub repository still needs this cleanup published to remove its obsolete
policy files; the deployed app's runtime is unaffected by these tooling files.

## Validation

Both fresh registry reports returned zero findings. The restored
`npm run audit:security` passed without an exception. TypeScript, ESLint and all
976 remaining tests across 48 files passed; the 31 removed tests belonged only
to the retired exception machinery. Git diff and new-file whitespace checks
passed, and the application source, dependencies and lockfile are unchanged.

No new browser/build run, database migration, provider change or hosted release
is required for this local audit-command/documentation cleanup. The previously
tested live application remains unchanged. Publishing this cleanup remains a
separate next step.
