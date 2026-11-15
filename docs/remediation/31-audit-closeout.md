# Original audit close-out

Recorded November 15, 2026 (Asia/Manila). This reconciles the owner's original
27 findings, reviewed at `4e4cc9e`, with the released source and retained evidence.
It updates status; it does not restart the audit or claim an independent new
penetration test. Reports 01-29 retain their dated implementation history.

## Release and scope

The **controlled-demo release is complete**. The owner selected authorized test
accounts, synthetic school records and test-mode payments, accepted the documented
cron-attribution limit, and separately authorized publication, merge, staging and
promotion. Real-world production acceptance remains incomplete.

| Item | Recorded result |
| --- | --- |
| Live application | <https://neu-arrs.vercel.app> |
| Released commit | `3270a70f0745421f41bcc3cc6e9a63f51f52b7b8` |
| Promoted build | `dpl_7e9rwRZ6hZ2GgUuUK5wDQDkoZ8TZ`; the tested Production build was promoted without rebuilding |
| Publication | [PR #4](https://github.com/rnjhnd/NEU-ARRS/pull/4), merged after [CI #487](https://github.com/rnjhnd/NEU-ARRS/actions/runs/43664601774) passed |
| Merged-source verification | [CI #488](https://github.com/rnjhnd/NEU-ARRS/actions/runs/43672408366): all six jobs passed on the exact merge commit |
| Quality and regression checks | TypeScript, lint, 942 tests in 45 files, and 132 synthetic Chrome checks passed |
| Security and persistence checks | Complete-lockfile audit reported zero vulnerabilities; five disposable and five native PostgreSQL migration scenarios, zero drift, and build/HTTP smoke checks passed |
| Hosted schema | All 13 migrations applied; the identity-review and financial-date additions were backed up, verified and applied on November 13; existing evidence was preserved |
| Hosted role acceptance | Student dashboard/redirect, admin queue/review/both reports, and employee queue/review/finance denial passed on the candidate; employee finance APIs returned HTTP 403 |
| Live postflight | Existing student dashboard loaded two requests; `/admin` returned that student to `/dashboard`; anonymous finance access was blocked |
| Release controls | Automatic Preview deployments disabled; automatic production-domain assignment disabled; saved variables remain Production-only |
| Previous deployment | `dpl_9r2H3AVbeEaxQ4ikmW7YqcTrTDXQ`, commit `15c330c`, retained READY as a rollback reference; no rollback was performed |

These are recorded results, not a claim of perpetual dependency security or
exhaustive traffic health. The original failing suite was expanded and repaired;
its two passing/three failing tests are not the same suite as the 942-test release
suite. No runtime suite was rerun for this documentation close-out.

## Finding disposition

**C** means the implementation and applicable controlled-demo checks are complete
in the released source. A suffix such as **C / O1** points to an unresolved
real-world operational prerequisite below; it does not mark that prerequisite
complete. All 27 original implementation findings are accounted for. No finding
is silently removed or converted into a claim of real-student readiness.

### 1. Codebase architecture and design

| ID / original priority | Current location | Disposition and implemented correction | Evidence |
| --- | --- | --- | --- |
| A1 / High | `prisma/schema.prisma`, `prisma/migrations/`, `scripts/smoke-migrations.mjs` | **C.** Forward migrations reproduce the schema and retain applied history. Legacy upgrade guards, native replay and generated-client smoke checks pass; all 13 migrations reached the hosted application database. | [04](04-migration-alignment.md), [22](22-finance-reporting-requirements.md), CI #488 |
| A2 / Medium | `src/app/actions/`, `src/lib/services/`, shared `*-data.ts` modules | **C.** Authorized, parsed action adapters call server-only mutation services. Initial render and refresh share guarded loaders; ESLint restricts action implementation imports. | [23](23-service-boundaries-dtos.md) |
| A3 / Medium | `src/lib/services/configuration.ts`, `src/lib/configuration-data.ts`, `src/app/(student)/dashboard/page.tsx` | **C.** Catalog initialization is explicit and audited. Reads do not seed data or write default Clerk roles during rendering. Missing roles are resolved without a render-time metadata mutation. | [17](17-document-settings-validation.md), [18](18-authentication-role-session.md), [23](23-service-boundaries-dtos.md) |
| A4 / Low | `src/proxy.ts`, `src/lib/auth.ts` | **C.** Replaced the deprecated middleware filename with Proxy; user-session routing and exact machine-authenticated cron exceptions retain their own server guards. | [18](18-authentication-role-session.md), [07](07-cron-cleanup-safety.md) |

### 2. Code quality and refactoring

| ID / original priority | Current location | Disposition and implemented correction | Evidence |
| --- | --- | --- | --- |
| Q1 / Medium | `src/app/(admin)/admin/queue-table.tsx`, `queue-update-dialog.tsx`, `use-queue-update.ts`, finance/settings/configuration clients | **C.** Stable tables, dialogs, editors, chart modules, typed models and focused mutation hooks replace the large mixed-responsibility render functions. | [13](13-admin-queue-refactoring.md), [14](14-finance-reporting.md), [17](17-document-settings-validation.md) |
| Q2 / Medium | `src/lib/document-identity.ts`, student/queue/finance/movement models, `src/lib/services/` | **C.** Read DTOs carry separate stable document IDs/display labels and ISO timestamps. Render/poll paths share mapping; mutation responses contain only confirmed fields. | [23](23-service-boundaries-dtos.md) |
| Q3 / Medium | `src/lib/services/staff-requests.ts`, `src/lib/request-workflow.ts`, `src/lib/notification-content.ts` | **C.** Reversal detection uses the original transition snapshot. Old/new states and correction intent are audited before delivery; an already-updated row is not the comparison baseline. | [03](03-staff-fulfillment.md), [09](09-durable-notifications.md) |
| Q4 / Medium | `src/lib/configuration-model.ts`, `src/lib/services/configuration.ts`, `src/lib/role-operations.ts` | **C.** Runtime schemas constrain roles, keys, structured settings, prices and versions. Decimal input is parsed into exact integer centavos; stale writes and malformed values are rejected. | [17](17-document-settings-validation.md), [18](18-authentication-role-session.md) |

### 3. Security vulnerabilities

| ID / original priority | Current location | Disposition and implemented correction | Evidence |
| --- | --- | --- | --- |
| S1 / High | `package.json`, `package-lock.json`, `.npmrc`, `.github/workflows/main.yml` | **C / M2.** Reviewed dependency updates, exact pins, strict peer/install policy and an independent audit job address the reported advisory set. The recorded release audit returned zero findings; ongoing advisories still require maintenance. | [05](05-dependency-security.md), [19](19-tooling-ci.md), CI #488 |
| S2 / High | `src/lib/paymongo.ts`, `src/lib/monetary-ledger.ts`, `src/lib/cancellation-refunds.ts` | **C / O3.** Refunds use verified gross PHP centavos, a permanent submission claim, matching provider references and confirmed outcomes. One genuine PHP 150 test payment received one full succeeded test refund. The original endpoint/reason recommendation was corrected; see the erratum below. | [01](01-refunds.md), [08](08-manual-cancellation-reconciliation.md), [15](15-verified-money.md), [29](29-payment-provider-acceptance.md) |
| S3 / High | `src/app/api/webhooks/paymongo/route.ts`, `src/lib/paymongo-webhook.ts`, `paymongo-webhook-verification.ts`, `paymongo-namespace.ts` | **C / O3.** Raw signatures, delivery freshness/mode/schema/size, event receipts, checkout/quote correlation and guarded transactions protect recording. Exact provider reads recover stale snapshots; foreign namespaces are ignored before database access. Late/duplicate events preserve terminal states. | [02](02-payment-webhook.md), [28](28-paymongo-namespace-isolation.md), [29](29-payment-provider-acceptance.md) |
| S4 / High | `src/lib/request-workflow.ts`, `src/lib/services/staff-requests.ts`, `src/lib/services/identity-review.ts` | **C.** Payment and academic-identity invariants apply to ordinary, bulk and override fulfillment. Employee input cannot grant administrator capabilities; cash completion requires collection confirmation. | [03](03-staff-fulfillment.md), [15](15-verified-money.md), [21](21-student-identity-verification.md) |
| S5 / Medium | `src/lib/services/student-requests.ts`, `src/lib/checkout.ts`, `src/lib/configuration-data.ts` | **C.** The server validates an existing active document and payment availability, freezes the quote and rejects unknown/inactive configurations; no fallback price substitutes for invalid input. | [06](06-checkout-idempotency.md), [17](17-document-settings-validation.md) |
| S6 / Medium | `src/lib/services/identity-review.ts`, `src/lib/request-identity.ts`, `RequestIdentityReview` | **C / O1.** Student input remains unverified until staff attest against school records for the exact request/account/name/number. Fulfillment cannot bypass review. Synthetic rehearsal and hosted read-only gates passed; actual registrar procedure acceptance remains open. | [21](21-student-identity-verification.md), [26](26-synthetic-registrar-acceptance.md) |
| S7 / Medium | `src/lib/configuration-data.ts`, `src/lib/services/configuration.ts`, `src/app/actions/configuration.actions.ts` | **C.** Internal settings reads are server-only; student-facing settings use an authenticated allowlist and administrative reads require the current authorized actor. The arbitrary-key settings Server Action was removed. | [17](17-document-settings-validation.md), [23](23-service-boundaries-dtos.md) |
| S8 / Medium | `src/lib/csv.ts`, queue/finance/movement serializers and export routes | **C.** Shared serialization quotes cells, doubles embedded quotes and neutralizes formula/control prefixes. Exports retain explicit date/amount bases and bounded, authorized datasets. | [13](13-admin-queue-refactoring.md), [14](14-finance-reporting.md), [22](22-finance-reporting-requirements.md) |

### 4. Dead code and unused files

| ID / original priority | Current location | Disposition and implemented correction | Evidence |
| --- | --- | --- | --- |
| D1 / Low | UI imports/state, former `src/lib/email.ts`, queue/directory/configuration clients | **C.** Removed confirmed unused declarations, obsolete client-side full-history helpers and the replaced immediate email helper. Release lint passes. This does not assert that every remaining file is indispensable. No speculative whole-file/asset purge is required. | [09](09-durable-notifications.md), [12](12-student-history-pagination.md), [20](20-final-cleanup-performance.md) |
| D2 / Low | `src/emails/status-update-email.tsx`, workflow models, `spec.md`, `tasks.md`, `README.md` | **C.** Removed unreachable application branches for retired literals and replaced stale contracts/plans. Historical migration values, rejection fixtures and frozen provider payloads remain deliberately intact. The current release status is reconciled here. | [24](24-documentation-compatibility-cleanup.md) |

The initial audit did not confirm whole source modules or public assets safe to
delete. Subsequent removals above were justified by replaced consumers. Keep
`tailwindcss-animate` while CSS consumes it and `@react-email/render` while the
current email renderer imports it; absence from an unrelated TS import scan is
not removal evidence.

### 5. Performance and reliability

| ID / original priority | Current location | Disposition and implemented correction | Evidence |
| --- | --- | --- | --- |
| P1 / High | Request services, `src/lib/cancellation-refunds.ts`, `src/lib/checkout-expiry.ts`, ledger/outbox writers | **C.** Guarded versions/row locks and transactions bind state, audit, money and notification intent. Durable claims/leases coordinate external effects after commit; uncertain provider outcomes stay reviewable. | [03](03-staff-fulfillment.md), [07](07-cron-cleanup-safety.md), [08](08-manual-cancellation-reconciliation.md), [15](15-verified-money.md) |
| P2 / High | `src/lib/checkout.ts`, `src/lib/paymongo-checkout.ts`, `CheckoutAttempt` | **C / O3.** Account-scoped intents, frozen quotes/payloads, durable attempts and bounded provider idempotency recover eligible checkouts without blindly replacing payable sessions. Genuine test acceptance recovered the same checkout. | [06](06-checkout-idempotency.md), [29](29-payment-provider-acceptance.md) |
| P3 / Medium | `src/proxy.ts`, `src/lib/cron-auth.ts`, exact cron routes, `vercel.json` | **C / L1.** Exact service routes enforce a configured secret independently of Clerk/Redis. Cleanup uses bounded leased work and guarded expiry/cancellation. November 15 natural outcomes were retained on the previous build; current CI HTTP checks passed, and unchanged daily schedules now target the promoted build. | [07](07-cron-cleanup-safety.md), [27](27-owner-notification-and-cron-evidence.md), [30](30-controlled-demo-release-review.md) |
| P4 / Medium | `src/lib/student-request-data.ts`, `admin-queue-data.ts`, `admin-queue-query.ts`, finance/movement/directory loaders | **C / M3.** Server-selected pages, aggregate queries, minimal DTOs, active 30-second polling and supporting indexes replace five-second full-history downloads. Exports and reporting reads enforce explicit bounds. Deep offset/search costs are not claimed constant-time. | [12](12-student-history-pagination.md), [16](16-student-directory.md), [20](20-final-cleanup-performance.md), [22](22-finance-reporting-requirements.md) |
| P5 / Medium | `src/lib/student-directory-data.ts`, `src/lib/role-operations.ts`, queue/profile loaders | **C / M3.** Profile lookups and role/directory snapshots paginate provider data explicitly and reject incomplete/oversized snapshots. Administrator checks no longer silently stop at the original 500-account boundary. The 5,000-account/2 MB directory bound remains explicit. | [16](16-student-directory.md), [18](18-authentication-role-session.md), [20](20-final-cleanup-performance.md) |
| P6 / Medium | `src/lib/notification-worker.ts`, `notification-wakeup.ts`, outbox/retry services | **C / O4.** Transactional intent, frozen payload/idempotency, bounded provider calls, explicit acceptance/error handling, leases and daily recovery replace silent inline sends. One owner-only message reached Inbox; wider-recipient delivery is not accepted. | [09](09-durable-notifications.md), [27](27-owner-notification-and-cron-evidence.md) |
| P7 / Medium | Typed fetchers, `src/components/session-guard.tsx`, `src/app/error.tsx`, guarded API routes | **C.** Actor-scoped validated responses, stale/error states, bounded retries, revoked-session handling and sanitized error recovery replace unconditional logout and hidden polling failures. Hosted employee finance APIs returned 403 and rendered no report data. | [10](10-navigation-state.md), [11](11-student-request-state.md), [18](18-authentication-role-session.md), [25](25-staged-acceptance-portal-routing.md), [30](30-controlled-demo-release-review.md) |
| P8 / Medium | `src/lib/money-movement-data.ts`, `monetary-ledger.ts`, movement-date service, receipt rendering, `RequestCompletion` | **C / O5.** Separate submission-date and evidenced transaction-date reports share canonical money rules and Manila boundaries. Unknown dates remain unallocated; immutable completion/date evidence does not use mutable `updatedAt`. Genuine test collection/refund and undated refund reporting passed. | [15](15-verified-money.md), [22](22-finance-reporting-requirements.md), [29](29-payment-provider-acceptance.md) |
| P9 / High | `.github/workflows/main.yml`, test/build/migration scripts, regression suites | **C.** Lockfile installs, pinned actions and six independent/aggregate CI jobs verify security, quality, Chrome, disposable/native migrations, schema drift and isolated production HTTP behavior. Both PR and exact merged-source CI passed. | [19](19-tooling-ci.md), CI #487 and #488 |

## S2 recommendation erratum

The original audit's recommendation to change refunds to `/v1/refunds` and replace
`requested_by_customer` was not carried forward blindly. The provider guide and
resource reference conflicted. The reviewed implementation uses
`POST https://api.paymongo.com/refunds` with `requested_by_customer`, as recorded
in [01](01-refunds.md), and the genuine provider test in [29](29-payment-provider-acceptance.md)
confirmed one full succeeded refund. The amount-unit, correlation, claim and
uncertain-outcome defects were repaired. This is a correction to the initial
recommendation, not an unresolved request to change the working contract.

## Explicit operational limits and deferred work

These remain visible after code closure. They are not additional mandatory demo
batches or permission to change provider settings, buy resources or process real
records.

| ID / priority for the stated use | Owner and remaining acceptance | Demo disposition |
| --- | --- | --- |
| O1 / High before real fulfillment | Institution/registrar: approve and train the actual school-record procedure; verify existing in-progress identities before advancing them. | Synthetic fixture rehearsal and read-only gates accepted; no real academic identity was attested. |
| O2 / High before real-user launch | Application/identity owner: configure and validate institutional production authentication, domains and authorized account provisioning. | Existing Clerk development instance accepted for controlled test identities only. |
| O3 / High before live charges | Merchant/application owner: establish live-mode operational readiness, environment/webhook ownership and a separately approved live-money acceptance plan. | Genuine test-mode checkout/webhook/full refund passed; no real charge claimed. Shared test merchant uses application namespaces and separate signing secrets. |
| O4 / High before general-recipient email | Sender owner: provide an authorized verified sender/domain and validate recipient delivery/recovery. | Owner-only delivered/Inbox test accepted. Test sender restrictions remain; isolated payment-demo email is disabled and its new intents are held for review. |
| O5 / High before relying on affected historical records | Authorized registrar/finance operator: reconcile only from original identity/payment/date evidence; retain unknowns when evidence cannot be established. | Two original requests were preserved. A historical paid flag is not a verified collection; reports explicitly exclude the affected monetary amount. |
| L1 / Medium evidence limit | Operator: independent legacy scheduler execution history remains unverified. Morning captures describe live commit `15c330c`, not a natural execution of later promoted `3270a70`. Observe future runs of the promoted build during normal operations if further evidence is needed. | Owner accepted the attribution limit for this demo. Current machine-auth/worker behavior also has CI HTTP coverage. No manual production cron probe or paid observability was used. |
| L2 / Medium before enabling Previews | Application owner: provision and accept isolated Preview data/auth/provider credentials before deliberately enabling automatic Previews. | Temporary containment is complete; Previews stay disabled and shared variables stay Production-only. |
| M1 / Low current compatibility maintenance | Application/database owner: review explicit TLS verification configuration before a future driver behavior change. | The bounded live sample retained the known `pg` SSL-mode compatibility warning; it did not demonstrate a current certificate-validation failure. No saved credential/TLS setting was changed. |
| M2 / Ongoing maintenance | Maintainer: continue dependency advisories, toolchain lifecycle and required CI checks after this recorded release. | No known dependency advisory remained in the recorded full-lockfile audit; this is not a perpetual guarantee. |
| M3 / Future capacity work | Maintainer: revisit directory/report bounds, deep pagination and search plans when actual volume requires it. | Bounded reads fail explicitly rather than silently returning partial totals. This release is not an institution-scale load certification. |

## Evidence and change history

| Checkpoint | Scope |
| --- | --- |
| `7949461` | Original remediation batches 1-16 |
| `6b03841` | Batch 17 configuration validation |
| `dcb58a5`, `5892904` | Batches 18-20 and independent native migration follow-up |
| `bb856de`, `25bdff2` | Remaining original S6/P8/A2/Q2/D2 work and Device Trust correction |
| `f8d8292` / merge `8f7aaec` | Verified-account portal redirect |
| `fb1ea51`, `b34f062` | Payment namespace separation and stale provider snapshot recovery |
| `e7c3b9d` / merge `3270a70` | Natural-job evidence, accepted demo limit, and released reviewed tree |

Public implementation reports and linked CI runs are the portable evidence.
Documentation-only close-out checks matched all 27 IDs and original priorities,
resolved 143 local Markdown link targets and 53 explicit source-path references
across the eight changed documents, checked release claims against the saved
receipts, and passed `git diff --check`. A high-confidence credential-pattern
check found no matching values in those documents; it is not a full secret audit.
No application files or hosted settings changed, and the runtime suite was not
repeated for these Markdown edits.

Additional local receipts are retained under ignored `scratch/`:
`production-two-migrations-result.json`, `pr4-staged-release-result-20261115.json`,
`pr4-staged-student-check.json`, `pr4-staged-admin-check.json`,
`pr4-staged-employee-check.json`, `pr4-employee-finance-http-statuses.json`, and
`pr4-promotion-result-20261115.json`. These local files are not required to build
the app and are not automatically published with this report. Protected backups,
credentials, browser sessions and raw private payloads must remain private.

See the [current release record](30-controlled-demo-release-review.md),
[checklist](../../tasks.md), and [demo/rollback guide](../demo-and-rollback-guide.md).
