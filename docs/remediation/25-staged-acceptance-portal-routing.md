# Staged acceptance: workspace redirect recovery

## Observed behavior

Read-only acceptance of candidate `59180d7` confirmed the existing student's
dashboard, two owned history rows, history refresh and registrar-review notice.
Visiting `/admin` displayed **Account access restricted** without revealing staff
data. Returning directly to `/dashboard` worked. The expected automatic workspace
redirect did not occur.

The owner registered two accounts and explicitly authorized their
admin/employee assignments. Both roles were applied and verified through Clerk's
management API for previously unmanaged accounts, with unrelated public metadata
preserved and prior sessions ended. The application database was read only. This
separate configuration step establishes account availability. Subsequent admin
read-only checks passed on candidate `59180d7`: the two-request queue and counts,
unverified registrar-review state and disabled submit controls, submitted-date
Settled Request Values, transaction-date Money Movements, refresh and full-page
reload. The current finance views are empty; the movement report separately
flags one historical request lacking verified collection evidence and excludes
its unknown amount. Subsequent employee checks also passed: EMPLOYEE badge and
restricted navigation, the existing queue and unsubmitted registrar-review
controls, and direct access checks of both finance URLs. Both finance pages show
the sanitized recovery screen without report totals/rows. Returning directly to
the employee queue succeeds. No review/evidence submission or export was used.
These observations do not assert HTTP status codes or validate real registrar
decisions or financial/provider operations.

## Correction

The client `SessionGuard` hides server children until account verification. Its
role mismatch branch previously denied an otherwise verified account, keeping
the server children carrying the redirect hidden. The guard now validates the
`/api/session` snapshot and matching Clerk account before replacing the current
route with the appropriate fixed workspace path:

- Student visiting `/admin` or its descendants: `/dashboard`.
- Employee/admin visiting `/dashboard` or its descendants: `/admin`.

Protected children stay hidden while verification and navigation are pending.
Missing, mismatched, malformed, rejected and unavailable sessions retain their
existing fail-closed behavior. Server-side data/action authorization remains
independent of this navigation aid. No provider, schema or dependency changes
are required.

## Validation and release status

Four synthetic Chrome regressions cover delayed-verification student routing,
employee/admin routing and refusal to redirect a mismatched account. Before the
fix, all three valid-account routing cases failed; the account-mismatch case
passed. After the fix, all 18 authentication browser checks pass. The fixture
uses loopback-only mocked sessions with outbound requests blocked, and no real
accounts or business records.

TypeScript, ESLint and all 852 Vitest tests across 44 files pass. The isolated
production build passes using an owned disposable database and synthetic
provider credentials. Cron HTTP smoke checks pass for unauthorized requests,
empty authorized runs, lease release, HEAD rejection and missing-secret failure.
No migration replay was needed for this change without schema changes. The other
114 browser checks were not repeated; the complete affected authentication suite
of 18 checks was run.

Candidate `59180d7` contains the observed denial-screen behavior. This correction
is a separate reviewed checkpoint for the authorized staged-release workflow.
A new candidate must pass exact-commit CI and a hosted student recheck before
the workspace-redirect acceptance item can close.
Full signed-in acceptance remains incomplete until the hosted student redirect
is rechecked with this correction. Full operational acceptance also remains
incomplete. Keep production-domain auto-assignment disabled; staging this
correction does not authorize promotion, business mutations, additional role
changes or operational deferrals.
