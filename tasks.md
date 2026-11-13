# NEU-ARRS remediation and release checklist

Reviewed 2026-11-13 against the current working source. Checked items below mean
local implementation/validation, unless explicitly described as historical hosted
work. They do not assert a new production deployment. See [spec.md](spec.md) for
the current contract and [README.md](README.md) for executable check commands.
Original planning copies were preserved locally before this D2 rewrite.

## Completed source work

- [x] Original batches 1-20: guarded refunds/webhooks/workflow, migration alignment,
  checkout recovery, cron safety, durable notifications, navigation/state,
  pagination, finance, verified money, directory, configuration, roles and CI.
- [x] S6: per-request registrar school-record review; audited verify/revoke and
  identity/payment gates for ordinary, bulk and override fulfillment.
- [x] P8: retain submitted-date Settled Request Values; add transaction-date Money
  Movements, explicit undated evidence, immutable date/completion provenance.
- [x] A2/Q2: thin authorized actions, server-only services, pure client money
  predicates, explicit document ID/label DTOs and versioned read contracts.
- [x] D2: replace stale specifications/checklists, remove their contradictory
  ignore entries, correct README guidance, preserve originals and remove the
  retired email palette branch. Keep migration history,
  older-client rejection tests and frozen durable payload contracts intact.

## Local verification baseline

The pre-D2 combined S6/P8/A2/Q2 source passed the following checks; dated batch
reports retain their original results. D2's fresh results are recorded separately
in [the D2 report](docs/remediation/24-documentation-compatibility-cleanup.md).

- [x] TypeScript and ESLint.
- [x] 852 tests in 44 Vitest files, including disposable transaction tests.
- [x] All 128 synthetic Chrome navigation/component checks.
- [x] Five disposable migration scenarios, including evidence/date upgrade guards.
- [x] Isolated production build using synthetic providers and an owned database.
- [x] Git whitespace check. No dependency/schema change in A2/Q2 or D2.

Synthetic fixtures validate application behavior, not real registrar procedures,
live payment delivery, inbox receipt or a hosted scheduled job. Build-check
`.next` output is verification-only and must not be deployed.

## Pending coordinated release and acceptance

- [x] Review the combined local source and record a local audit checkpoint commit
  under the owner's instruction. Push/deployment remain separate steps.
- [ ] Push through the approved workflow and obtain current remote required CI
  checks, including native PostgreSQL migration verification.
- [ ] Verify the intended application database, back up and rehearse the upgrade;
  apply pending `20261113000100_request_identity_review` and
  `20261113000200_financial_dates` through the explicit migration datasource.
  Earlier hosted recovery verified 11 migrations; this source prepares 13.
- [ ] Deploy matching actions/read APIs/clients after the approved migration;
  reload old dashboard/queue/finance tabs for current DTO formats.
- [ ] Verify the locally committed Device Trust fix and current combined code in
  the deployed app, including signed-in student/employee/admin behavior.
- [ ] Train registrar staff and accept the real school-record review procedure;
  ensure existing in-progress requests receive review before further fulfillment.
- [ ] Exercise an approved actual PayMongo test-mode checkout/webhook/refund
  roundtrip; confirm evidence and duplicate/recovery behavior without real charges.
- [ ] Reconcile historical money/dates only from reviewed original evidence where
  applicable. Unknown/unresolvable history stays explicitly unknown.
- [ ] Accept both finance reports/receipts using actual known-date and undated
  evidence, including Manila boundaries and preserved completion history.
- [ ] Complete appropriate sender/domain configuration and confirm actual inbox
  delivery, or explicitly defer broader notifications within test-sender limits.
- [ ] Observe natural daily cleanup/notification runs and saved results. Do not
  invoke production cleanup as a connectivity check.
- [ ] Review Clerk production key/domain requirements for the intended release.
- [ ] Record any explicit owner-approved operational deferrals and their limits.

## Separate post-batch-20 follow-ups

Prior recovery restored the production database/Redis and the owner confirmed
that the dashboard loaded. Preview containment disabled automatic previews and
removed shared production credentials from Preview scope. Those facts are not
proof that the newest local source has been deployed.

- [ ] Resume additional post-batch-20 environment/readiness work after original
  audit closure, including isolated Preview resources and credential scopes.
- [ ] Keep automatic Preview deployments disabled until isolated test resources,
  provider configuration and acceptance are ready; do not reuse production data.
- [ ] Continue dependency/toolchain maintenance, including ESLint lifecycle review.

All 27 original finding implementations are addressed locally after D2. Full
original acceptance remains pending the release/operational checks above or
explicitly agreed deferrals. No paid resource or purchase is part of this work.
