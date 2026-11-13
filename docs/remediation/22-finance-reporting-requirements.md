# P8 finance reporting: requirements review

Status: the owner selected the additive transaction-date report on 2026-11-13.
Implemented and validated locally; database/application rollout and real-provider
acceptance remain pending. S6's local implementation is preserved and remains
uncommitted, with its own rollout/registrar acceptance pending independently.

## Baseline reviewed before implementation

| Location | Current behavior / remaining gap |
| --- | --- |
| `src/lib/finance-data.ts` | Filters and orders by `Request.createdAt`, selecting a submitted-date cohort, not collections/refunds occurring during the period. |
| `src/lib/finance-model.ts` | Groups verified settled request values by creation date. Cancelled/refunded requests are excluded from that measure. It does not calculate a transaction-date cash-movement report. |
| `src/lib/monetary-ledger.ts` | Canonical amounts use integer centavos with evidence links. `paidAt` is nullable; `verifiedAt` is observation/verification time. Cash completion confirmation currently leaves the actual collection date unknown. |
| `src/lib/monetary-ledger.ts`, `prisma/schema.prisma` | Confirmed full refunds have an amount/evidence link and `refundVerifiedAt`. That field records when the application recorded confirmation, not an established actual refund transaction date. |
| `src/app/(print)/receipt/[id]/page.tsx` | Receipts already distinguish collection-recorded time and evidenced payment time; missing payment dates are not replaced by `updatedAt`. This earlier fix should be preserved. |
| `src/app/actions/admin.actions.ts` | Completion transitions are audited, but there is no dedicated immutable completion-date field/event contract for P8. A later status edit must not become the original completion time. |

The original P8 recommendation was to persist immutable payment, cash-collection,
refund and completion timestamps, report using payment/refund evidence, and use
an explicit reporting timezone. Earlier batches addressed amount provenance and
misleading receipt dates, but deliberately retained the submitted-date report.

## Reporting-policy decision

Selected: add a separately labelled **Money Movements** report and retain
**Settled Request Values** as the explicitly submitted-date report.

Implemented rules for the Money Movements report:

- Use evidenced collection/refund occurrence dates for period membership and
  trends, independently of when the request was submitted or later edited.
- Present gross verified collections, confirmed refunds, and their difference
  as **net recorded movements**. The difference is not provider payout,
  fee-adjusted proceeds, profit, or an assertion of complete accounting records.
- Keep original collections visible when requests are later cancelled/refunded.
  Record confirmed refunds separately. Pending, failed or uncertain refund
  attempts must not be subtracted as successful refunds.
- Retain unknown/ambiguous amounts and dates as explicit reconciliation items.
  Undated amounts are not assigned to a selected period. Any undated summary
  must say its dates are unknown and that it is not a total for that period.
- Use UTC storage and Manila (UTC+08:00) calendar boundaries. Cards, charts,
  tables and exports must use the same selected basis and snapshot.
- Preserve administrator-only server authorization, private/no-store responses,
  actor-scoped client caches, validation, integer-centavo arithmetic, bounded
  queries/exports and safe CSV handling.

## Date evidence requirements

| Event | Acceptable date basis | Must not substitute |
| --- | --- | --- |
| Online collection | Validated provider payment time correlated to the canonical payment, or reviewed matching historical evidence. | Request creation/update time, webhook arrival time, or collection verification time. |
| Cash collection | A registrar's explicit attestation of the actual collection time or a reviewed original receipt establishing it. | Completion time or the time an older receipt is entered, without an explicit collection-time attestation. |
| Refund | A verified successful refund occurrence time supported by the provider contract/evidence, or reviewed matching historical evidence. Provider field semantics must be checked before adopting any timestamp. | Refund request creation, uncertain POST response time, or `refundVerifiedAt` presented as the actual refund time. |
| Completion | The committed completion event's recorded workflow time, retained independently of later edits/reversals. | The request's current `updatedAt`, or payment/cash-collection time. |

Occurrence time and the time evidence was recorded must stay distinguishable.
Corrections/re-completions need an explicit event history or equivalent preserved
provenance; a second completion must not overwrite the first historical event.
Unknown historical dates must remain unknown. Any evidence-based reconciliation
must be separately reviewable, authorized, repeatable, and non-destructive.

The implementation keeps the existing full-refund operations and canonical
amounts. No actual payments/refunds, real-student fixtures or automatic historical
backfills were used. Missing dates stay unknown until original evidence is
reviewed explicitly.

## Acceptance examples for the selected policy

| Scenario | Expected behavior |
| --- | --- |
| Request submitted November 1, PHP 150.50 collected November 13 | Submission report uses November 1; money-movement report records PHP 150.50 on November 13. Neither uses the last edit date. |
| That collection is refunded on November 15 with confirmed date evidence | November 13 keeps the original collection. November 15 shows the PHP 150.50 refund separately; combined known net movement is zero. |
| Request cancelled while collection remains paid and refund unresolved | Original collection remains in money movements; unresolved refund is flagged and not represented as completed. |
| Canonical cash amount is verified but receipt has no collection date | Show the known amount as undated/requiring date reconciliation; do not add it to a selected day's totals. |
| Refund amount is confirmed but only its verification time is known | Show a confirmed undated refund; do not assign it to the verification date as if that were the actual refund date. |
| A transaction occurs at midnight Manila / an inclusive end-date boundary | Membership follows explicit Manila boundaries, with the next day excluded. |
| Completion is later reversed or corrected | Earlier completion provenance remains; the current request version does not replace it. |
| Same payment/refund evidence is delivered again | No duplicate amount or transaction event; conflicting evidence rejects the change. |
| An administrator session expires during refresh/export | Existing authorization/cache protections hide stale private data and prevent a late export for a different account. |

## Implementation

- `/admin/finance/movements` and its administrator-only, private/no-store API
  provide gross collections, confirmed refunds, net dated movements, a bounded
  dated list and a separate server-paged undated list. A link on the existing
  finance page opens it; the original report/API and CSV/PNG remain available.
- Collection/refund history comes from canonical `RequestMoney`, independently
  of current request status. A later cancellation does not erase collection
  history. Refund verification time is never used as actual refund occurrence.
- Existing evidenced `paidAt` values remain the collection-date source.
  `MoneyMovementDate` stores separately audited original-evidence attestations
  for missing collection/refund dates, with occurrence and recorded times.
  The UI deliberately does not default the actual date to today.
- `recordMovementDate` verifies current administrator access, movement evidence
  identity/version, explicit review confirmation, reason, future-date limits and
  chronology. Only a confirmed refund can receive a refund date. Writes/audits
  commit atomically under a canonical-money row lock. Concurrent/stale attempts
  fail safely. This is a human evidence attestation, not automatic provider or
  paper-receipt verification. Known dates cannot be overwritten by this action.
- Database triggers also reject changed date/completion records, replacement of
  a known `paidAt`, and enrichment conflicting with attested dates/chronology.
  The reconciliation preview checks these dates before proposing enrichment.
  Conflicting records require a separately reviewed evidence-preserving recovery;
  this batch does not add a normal UI for replacing an incorrect attestation.
- Trigger functions retain PostgreSQL's default VOLATILE classification: their
  queries use fresh snapshots, together with the shared money-row lock. See the
  [PostgreSQL function-volatility documentation](https://www.postgresql.org/docs/current/xfunc-volatility.html).
- `RequestCompletion` stores the first completion recorded by the new writer,
  linked to its status audit. Corrections/re-completions preserve that record;
  subsequent status audits retain later transitions. Historical completion dates
  are not inferred. Receipts say **First recorded completion**, not first-ever
  completion, and use explicit Manila display for all shown timestamps.
- Receipts also recognize an attested collection date while retaining separate
  collection-verification time. Repeated completion records no second collection.
- Dated reports have a 5,000-movement sentinel and fail explicitly instead of
  silently truncating totals. Undated lists return ten rows per page, with
  database-side global summaries. Statement/transaction limits bound queries;
  the common payment-date range has a supporting index and a plan regression.
- CSV exports distinguish **Dated selected period** from **Undated current page
  only**. Unknown-date summaries are across all dates and do not belong to the
  chosen period. Current-page export does not claim to contain the whole list.

## Migration and rollout

`20261113000200_financial_dates` is additive and follows S6's
`20261113000100_request_identity_review`. It creates empty date/completion
tables, indexes and guards. It changes no historical request or financial value,
does not infer a refund date from `refundVerifiedAt`, and does not manufacture
completion dates for already completed requests.

Before using the new code against an app database, back up and inspect the
intended target, rehearse the pending migrations, apply them through the explicit
migration datasource, then deploy matching configured code. Never deploy the
synthetic `.next` build-check output. Existing app databases, production settings,
credentials and deployments were not changed by this local implementation.

Real registrar/provider evidence checks, production acceptance, and any reviewed
historical reconciliation remain rollout work. No new provider refund timestamp
mapping is assumed: a refund without established actual occurrence time stays
undated. Partial refunds, provider fees, bank settlement and profit accounting
are outside the selected money-movement report and existing refund workflow.

## Validation

Local checks passed: TypeScript, ESLint, 847 tests in 44 files, 49 targeted Chrome
checks (26 queue, 13 original finance, 10 new money movements), five disposable
migration scenarios, Prisma validation, whitespace checks and the isolated
production build. No dependencies were changed.

Database tests cover cross-period/refunded/cancelled history, Manila boundaries,
unknown and zero cash collections, explicit date evidence, version/role denial,
concurrency, atomic audit rollback, immutable dates, chronology, report caps and
the payment-date index. Migration tests include an upgrade with populated
canonical money, preserving known payment dates/amounts and leaving missing
occurrence/completion dates unknown. Actual generated-client CRUD for the new
tables is exercised and rolled back by migration smoke checks.

Chrome tests use isolated synthetic component fixtures; Prisma tests use owned
disposable databases. No actual provider transaction, hosted database migration,
real-school records check, commit, push or deployment was performed.
