# NEU-ARRS remediation and release checklist

Reconciled November 15, 2026 (Asia/Manila) with promoted commit `3270a70`.
The controlled-demo release is complete. Real-world production acceptance remains
incomplete; unchecked items below are scoped operational prerequisites or future
maintenance, not additional mandatory demo remediation batches.

Use the [27-finding close-out](docs/remediation/31-audit-closeout.md) for each
original ID, priority, implementation location, evidence and deferral. See
[spec.md](spec.md) for the current contract and [README.md](README.md) for checks.

## Completed implementation

- [x] Original batches 1-20: payment/refund/webhook/workflow guards, migration
  alignment, checkout recovery, cron safety, durable notifications, UI/state,
  pagination, reporting, canonical money, directory, configuration, roles and CI.
- [x] S6: request-bound, audited registrar review; identity/payment gates apply to
  ordinary, bulk and override fulfillment.
- [x] P8: separate submission-date and evidenced transaction-date reports;
  immutable date/completion provenance and explicit undated/unknown evidence.
- [x] A2/Q2: authorized thin actions, server-only services and explicit ISO DTOs
  with stable document IDs separate from labels.
- [x] D2: current planning/contracts and removal of unreachable application
  literals, while retaining applied migrations, compatibility fixtures and
  frozen provider payloads.
- [x] Device Trust/verified-account routing follow-ups and payment environment
  namespaces, stale provider-event recovery and bounded diagnostics.

## Completed migration, CI and release

- [x] Intended hosted target identified; native backup/restore and additive
  migration acceptance recorded. All 13 migrations applied; zero schema drift,
  repeat-deploy no-op and preserved historical evidence verified. Do not reapply
  completed work on the basis of older batch notes.
- [x] Separate test datasource/auth prepared and aligned before payment testing.
- [x] Reviewed checkpoint published through PR #4; [PR CI #487](https://github.com/rnjhnd/NEU-ARRS/actions/runs/43664601774)
  and exact [merged-main CI #488](https://github.com/rnjhnd/NEU-ARRS/actions/runs/43672408366)
  passed all six jobs.
- [x] Release quality: TypeScript, lint, 942 tests in 45 files and 132 synthetic
  Chrome checks; complete-lockfile audit reported zero vulnerabilities.
- [x] Five disposable and five native PostgreSQL migration scenarios, zero drift,
  generated-client smoke and isolated production build/HTTP checks passed.
- [x] Exact Production candidate checked with student, admin and employee
  sessions. Student `/admin` redirected; employee queue/review worked and both
  finance APIs returned 403; admin reports retained legacy evidence gaps.
- [x] Owner separately authorized promotion of the existing tested build.
  `dpl_7e9rwRZ6hZ2GgUuUK5wDQDkoZ8TZ`, commit `3270a70`, serves
  <https://neu-arrs.vercel.app> without a rebuild.
- [x] Live student dashboard/redirect and anonymous finance protection verified;
  bounded runtime sample contained the known TLS warning and expected auth
  denial, with no unclassified entries. No exhaustive health claim.
- [x] Previous deployment retained READY as rollback reference; no rollback run.
  Manual release settings, Preview containment and daily schedules preserved.

## Completed controlled-demo acceptance

- [x] Synthetic registrar rehearsal passed; hosted review gates checked without
  making a real school-record attestation.
- [x] Genuine isolated PayMongo test checkout, signed event, canonical collection,
  checkout recovery, receipt, one full test refund and report/reconciliation
  behavior accepted. The final duplicate HTTP replay was locally re-signed and
  remains labelled separately from the genuine provider delivery.
- [x] Both finance reports accepted with known-date/undated test evidence;
  existing mixed-unit amounts and unknown dates were not guessed or backfilled.
- [x] One synthetic owner-only notification accepted by the app/provider,
  marked Delivered and confirmed in Inbox. Broader sending explicitly deferred.
- [x] Natural November 15 cleanup/notification outcomes retained from previous
  live commit `15c330c`. Owner accepted the independent-scheduler-history limit
  for this demo. No natural execution of promoted `3270a70` is claimed yet.
- [x] [Release record](docs/remediation/30-controlled-demo-release-review.md),
  [close-out](docs/remediation/31-audit-closeout.md) and
  [demo/rollback guide](docs/demo-and-rollback-guide.md) record scope and limits.

## Deferred real-world operational acceptance

- [ ] **O1:** registrar approval/training for actual school-record review and
  review of affected in-progress requests before further fulfillment.
- [ ] **O2:** institutional production authentication/domain and authorized
  real-user provisioning accepted by the application/identity owner.
- [ ] **O3:** live merchant/payment operations and a separately approved real-money
  acceptance plan. Successful test-mode transactions do not close this item.
- [ ] **O4:** authorized verified sending domain/sender and general-recipient
  delivery/recovery acceptance. The current owner-only sender limit remains.
- [ ] **O5:** affected historical identity/money/date evidence reviewed where
  original evidence exists. Unresolvable values remain explicitly unknown.

## Containment, evidence limits and maintenance

- [x] Database/Redis recovery and temporary Preview containment were completed
  separately after batch 20. Shared saved variables remain Production-only.
- [x] Automatic Preview deployments remain disabled. Their deliberate future
  enablement requires isolated services/credentials and acceptance (**L2**).
- [ ] Independent legacy scheduler execution history remains unverified (**L1**).
  The completed demo accepts that limit; further observation of the promoted
  build is normal operational follow-up, not a claim that it already occurred.
- [ ] Review explicit TLS verification configuration before a future driver
  behavior change (**M1**); no TLS/credential change is authorized here.
- [ ] Continue advisory/toolchain lifecycle checks (**M2**) and revisit bounded
  pagination/directory/report capacity when actual volume requires it (**M3**).

This checklist records completion and deferrals. It grants no standing permission
to commit/publish further changes, migrate data, promote/rollback, change account
roles, initiate provider transactions or purchase resources.
