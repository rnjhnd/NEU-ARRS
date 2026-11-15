# Controlled demonstration release record

Updated November 15, 2026 (Asia/Manila) after separately authorized publication,
merge, staging checks and promotion. **The controlled-demo release is complete.**
Authorized test identities, synthetic registrar fixtures and test-mode payments
define this acceptance; real-student production readiness remains incomplete.

## Released artifact and verification

| Item | Result |
| --- | --- |
| Live URL | <https://neu-arrs.vercel.app> |
| Source | `3270a70f0745421f41bcc3cc6e9a63f51f52b7b8`, merged [PR #4](https://github.com/rnjhnd/NEU-ARRS/pull/4) |
| Production deployment | `dpl_7e9rwRZ6hZ2GgUuUK5wDQDkoZ8TZ`, READY; the staged build was promoted without rebuilding |
| Source identity | Merge tree matches reviewed head `e7c3b9d`; application code is unchanged from `b34f062` |
| Required CI | [PR run #487](https://github.com/rnjhnd/NEU-ARRS/actions/runs/43664601774) and [merged-main run #488](https://github.com/rnjhnd/NEU-ARRS/actions/runs/43672408366): all six jobs passed |
| Quality | TypeScript/lint, 942 tests in 45 files, 132 Chrome checks and complete-lockfile audit with zero reported vulnerabilities |
| Persistence/build | Five disposable and five native PostgreSQL migration scenarios, zero drift, generated-client smoke, production build and synthetic HTTP checks passed |
| Hosted schema | All 13 migrations applied; the two additive S6/P8 migrations were backed up, applied and verified on November 13 before release |

These results belong to the recorded source and checks. Documentation close-out
does not rerun the runtime suite or publish a newer application artifact.

## Acceptance results

| Item | Evidence and limit |
| --- | --- |
| Student | Candidate dashboard loaded two existing requests; direct `/admin` returned to `/dashboard` without staff data. Live postflight confirmed the same routing and loaded history. |
| Administrator | Queue, request-bound review panel and both finance reports loaded. Unverified identity could not be saved as verified without the required attestation; ordinary status save remained disabled. No review or financial record was changed. |
| Employee | Queue and review accessible; no administrator override controls or finance link. Both direct finance pages withheld reports; the actual finance API requests returned HTTP 403. Queue access still worked afterward. |
| Registrar procedure | Synthetic rehearsal passed; real school-record operating acceptance is deferred. See [26](26-synthetic-registrar-acceptance.md). |
| PayMongo | Genuine PHP 150 test payment, signed event, canonical collection, checkout recovery, receipt, one full test refund and both reports accepted on the isolated demo. The final duplicate HTTP check was locally re-signed, not a provider redelivery. See [29](29-payment-provider-acceptance.md). |
| Email | One owner-only synthetic message accepted, Delivered and confirmed in Inbox. General recipients remain restricted; isolated payment-demo email is disabled. See [27](27-owner-notification-and-cron-evidence.md). |
| Daily jobs | November 15 request/completion logs retained successful natural outcomes on then-live `15c330c`. Owner accepted the independent-history limitation for this demo; no natural execution of later `3270a70` is claimed. |
| Historical evidence | Original requests and legacy gaps preserved. Submission-date reports exclude unknown monetary values; transaction-date reports keep missing dates/evidence unallocated. |

## Promotion and live postflight

The owner explicitly approved promoting the exact tested candidate after all
three roles passed. The live alias and project Production target were verified
against `dpl_7e9rwRZ6hZ2GgUuUK5wDQDkoZ8TZ` and source `3270a70`.

The public sign-in HTML and live authenticated student dashboard were observed.
Anonymous non-document finance requests returned Clerk's signed-out
`protect-rewrite` 404 response without financial data. Browser-style requests
from a client missing its development-browser state returned the configured
Clerk handshake. The actual browser completed its existing-session flow and
rendered the live dashboard. The initial raw HTTP checks assumed different
client behavior; their samples remain retained as diagnostics. They are not
reported as five successful raw HTTP assertions or a repeated fresh-user signup.
See [Clerk's documented non-document protection behavior](https://clerk.com/docs/reference/nextjs/app-router/auth#auth-protect).

A bounded error/fatal log sample after promotion returned two entries: one known
`pg` SSL-mode compatibility warning and one expected authorization denial. No
unclassified failure appeared in that returned sample; this is not exhaustive
health monitoring or a load test.

No business mutation controls were used during staged/live role checks. No new
payment/refund/email, registrar attestation, data migration, manual cron run,
share link or automation-bypass credential was created during promotion/postflight.

## Preserved controls and rollback reference

Automatic Preview deployments remain disabled; saved configuration remains
Production-only and automatic production-domain assignment remains disabled.
The daily schedules remain `0 0 * * *` and `5 0 * * *` UTC and now target the
promoted build. The separate payment demo remains on
`dpl_6WXfwjSCs5VahKqqC58GfuX73dm9`.

Previous deployment `dpl_9r2H3AVbeEaxQ4ikmW7YqcTrTDXQ`, commit `15c330c`, was
rechecked READY and retained as a rollback reference. No rollback was performed.
A later rollback requires current compatibility review and separate authorization;
it does not undo database/provider activity. See the
[demo/rollback guide](../demo-and-rollback-guide.md).

## Closure and deferred work

The original 27 implementation dispositions and explicit real-world limits are
in [31-audit-closeout.md](31-audit-closeout.md). Actual registrar procedure,
institutional production auth, live-charge readiness, general-recipient sender
setup and evidence-based legacy reconciliation retain their own statuses.
Preview enablement, future capacity/toolchain maintenance and the accepted
scheduler-attribution limit are not silently marked complete.

Local receipts are retained under ignored `scratch/`:
`production-two-migrations-result.json`, `pr4-staged-release-result-20261115.json`,
`pr4-staged-student-check.json`, `pr4-staged-admin-check.json`,
`pr4-staged-employee-check.json`, `pr4-employee-finance-http-statuses.json`,
`pr4-live-browser-postflight.json`, `pr4-live-runtime-postflight.json`, and
`pr4-promotion-result-20261115.json`. Private backups and credentials remain private.
