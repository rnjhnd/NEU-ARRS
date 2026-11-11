# Batch 15: Consistent money storage and historical reconciliation

Implemented locally on 2026-11-11, following [batch 14](14-finance-reporting.md).
Earlier remediation changes are preserved. This batch separates expected prices,
verified collections, and confirmed refunds. It prepares an additive migration
and an evidence-based operator tool; it does not modify the application database,
retrieve real provider records, reconcile real history, or deploy anything.

Follow-up: [batch 16](16-student-directory.md) replaces the listed-student sample
with a bounded complete directory and database-side aggregates, preserving the
verified-money eligibility policy described here.

## 1. Codebase architecture and design

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `prisma/schema.prisma`, `prisma/migrations/20261111000800_verified_money/migration.sql` | `Request.amountPaid` mixed rounded pesos and centavos, with no reliable universal conversion rule. A separate one-to-one `RequestMoney` record now stores integer PHP centavos, payment method, provenance, a unique payment/receipt reference, and evidence links. Legacy fields remain unchanged. The ninth migration creates an empty table; it performs no backfill. |
| High | `src/lib/monetary-ledger.ts`, `paymongo-webhook.ts`, `paymongo.ts`, `cancellation-refunds.ts`, `cancelled-payment-reconciliation.ts`, `src/app/actions/admin.actions.ts` | Different workflows wrote and interpreted amounts independently. Shared collection/refund guards now write exact amounts with the durable audit and associated database state. Conflicting canonical amounts, references, or known payment dates fail instead of being overwritten. |
| Medium | `src/lib/finance-data.ts`, `finance-model.ts`, receipt page/client, student data/client | Finance, receipts, and student values used different amount fallbacks. They now consume verified collections and format centavos at the presentation boundary. Finance uses the versioned `finance-v2` contract; quotes and legacy units are not collection evidence. |

### Monetary contract

- `DocumentConfig.price` and `Request.quotedAmountCentavos` are expected prices in
  centavos. Creating a request or checkout does not record a collection.
- `Request.amountPaid` is read-only legacy evidence with unknown historical units.
  Application runtime code no longer reads or writes it for monetary decisions.
- `RequestMoney.collectedCentavos` is the verified original collection, including
  a valid zero for cash. Online collections require at least 100 centavos under
  the existing checkout policy. Provider amounts are never rounded to pesos.
- `verifiedAt` records when collection evidence was recorded/verified. Nullable
  `paidAt` records an actual provider/evidence payment time when available. Neither
  request `updatedAt` nor the observation time substitutes for an unknown payment
  date. Raw SQL reconciliation timestamps explicitly use UTC, including optimistic
  version comparisons on Windows.
- Nullable `refundedCentavos` records a confirmed full refund in current workflows.
  NULL means no verified refund total is recorded; it does **not** assert zero
  refunds. Pending, processing, failed, and uncertain refunds do not populate it.
  This is not a complete partial-refund, fee, settlement, or net-revenue ledger.
- The finance report remains a **submitted-date cohort** in Manila. It totals
  verified original collections only for eligible settled requests and excludes
  cancelled/refunded requests. It does not claim to show payment-date revenue or
  subtract every historical refund. Unknown amounts remain visible as needing
  review, with blank CSV amounts. Student summaries use the same eligibility rule
  for the listed students.
- Owner/administrator receipt authorization is retained. An otherwise eligible
  receipt without canonical money shows **Receipt Amount Needs Verification** and
  offers no print control. Verified zero is displayed as PHP 0.00. Payment dates
  without evidence display **Not recorded**.

PayMongo documents its amounts in centavos and its payment timestamp as Unix
seconds; adapters retain those units and only convert to PHP for display.
See [payment concepts](https://docs.paymongo.com/docs/payment-acceptance-key-concepts)
and the [payment resource](https://docs.paymongo.com/reference/payment-source).

## 2. Code quality and refactoring

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `src/app/actions/request.actions.ts`, `src/lib/paymongo-webhook.ts` | Cash requests were assigned money before collection; online payments rounded away fractional pesos. Premature/rounded legacy writes are removed. A signed correlated payment records its exact centavos; cash records the saved price only on explicitly confirmed completion. A legacy cash request with no saved price needs a verified receipt before completion. |
| Medium | `src/lib/money-format.ts`, `monetary-ledger.ts`, `finance-model.ts`, student/receipt consumers | Repeated unit conversion and inconsistent truthiness checks made zero and unknown amounts indistinguishable. One reusable formatter converts integer centavos for display, while shared predicates preserve zero and exclude unknown values from totals. |
| Medium | `src/lib/monetary-evidence.ts`, `scripts/reconcile-money.mjs` | Historical reconciliation needs explicit, reviewable inputs. A bounded strict manifest and independent evidence validators replace automatic multiply/divide heuristics. Audit extraction, database planning, and command-line configuration are separate. |

## 3. Security vulnerabilities and financial integrity

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | New migration, `monetary-ledger.ts` | Stored financial values lacked consistent evidence and uniqueness. PHP/method/source/centavo/refund checks, unique references/evidence, and restrictive foreign keys now protect canonical rows. Application paths reject canonical conflicts and commit state, audit, collection, and confirmed refund writes transactionally. Direct privileged database edits remain an operator responsibility; this is not a tamper-proof accounting system. |
| High | `src/lib/paymongo.ts`, cancellation refund modules | A refund could be disconnected from recorded collection units. The verified provider collection now commits with the existing permanent refund claim **before** the financial POST. A canonical conflict rolls the claim back and sends no POST. A confirmed full refund commits its total with the request state and result audit. Existing no-blind-retry and manual-reconciliation safeguards remain in place. |
| High | `monetary-evidence.ts`, `reconcile-money.mjs` | An arbitrary quote or audit JSON amount cannot prove a historical payment. Accepted evidence must match the request, successful recorded outcome, PHP currency/mode, checkout/payment reference, and exact provider amounts where present. Ambiguous payment arrays and unconfirmed refunds are rejected. Legacy refund results also require a matching permanent provider collection claim. |
| Medium | Reconciliation CLI and receipt page | Reconciliation has no public route and requires an explicitly supplied migration datasource. Apply requires an operator actor ID. Manifests have at most 100 unique requests and a 1-MiB file limit; unknown properties and conflicting evidence sources are rejected. Receipt authorization runs before monetary data is rendered. SQL uses bound parameters. |

Existing payment receipt checks still validate the signed webhook or authenticated
provider retrieval before these helpers run. Historical cash evidence is an
**operator attestation after inspecting an original receipt**, not a cryptographic
verification of paper evidence. Possession of a database credential alone does not
prove the operator's assertions; restrict and audit that operational access.

## 4. Dead code and unused paths

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | Request creation, webhook writers, finance/student/receipt amount paths | Rounded-peso writes, the historical cash fallback, and legacy amount interpretation are removed from active monetary paths. `amountPaid` is deliberately retained as evidence rather than deleted or rewritten. |
| Low | `src/lib/finance-model.ts`, finance API/browser fixtures | The prior quote-based finance DTO is superseded by `collectedCentavos` and `finance-v2`. Old tabs receive a reload response rather than silently mixing report meanings. Historical batch-14 documentation and its image remain as an audit record. |

No unrelated components/assets were removed. The student-management UI refactor,
document/settings validation, auth pages, and tooling cleanup remain later batches.

## 5. Performance and reliability

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `scripts/reconcile-money.mjs` | Partial or stale backfills could corrupt history. Dry runs use a read-only repeatable-read transaction. Apply locks requests in a stable order, validates the whole batch before writes, checks expected UTC versions for changes, and commits all writes together. It never overwrites existing collection amounts/references/known dates; only missing dates or refund totals can be enriched from matching evidence. Repeat apply is a no-op. |
| Medium | New schema, finance and student loaders | Canonical records are joined by indexed request primary keys. Finance retains database date filtering/minimal projection and its 5,000-request cap. Student monetary reads are restricted to listed user IDs. Full student-directory pagination/aggregation remains batch 16. |
| Medium | Cash completion and provider refund transactions | Missing or conflicting money fails the entire affected database transaction, including workflow/audit writes. Cash batch failure does not partially complete earlier requests. Provider calls are outside database transactions; uncertain financial side effects still require reconciliation. |

## Operator rollout and historical recovery

1. Follow the [existing migration procedure](04-migration-alignment.md). Back up
   the intended database, review migration status, and test on a disposable clone.
   Apply the prepared **ninth** migration before releasing code that reads
   `RequestMoney`; it neither converts history nor populates canonical rows.
   All prepared earlier migrations still require the appropriate release process.
2. Release the server writers, finance API, and consumers together. Reload open
   finance tabs. Existing receipts/summaries may show amounts needing review until
   original evidence is reconciled. Do not deploy the `.next` verification output;
   rebuild with the intended deployment configuration.
3. Review original provider audit records and cash receipts. Keep an evidence
   manifest outside source control. Use an audit ID from a supported, correlated
   payment/confirmed completion, or an actual verified cash receipt. Include the
   request's current `updatedAt` as a UTC ISO timestamp. For example:

   ```json
   [
     {
       "requestId": "actual-request-id",
       "expectedUpdatedAt": "2026-11-11T04:00:00.000Z",
       "collectionAuditId": "paymongo:live:actual-event-id"
     },
     {
       "requestId": "actual-cash-request-id",
       "expectedUpdatedAt": "2026-11-11T04:00:00.000Z",
       "cashReceipt": {
         "reference": "actual-unique-official-receipt-number",
         "amountCentavos": 15050,
         "currency": "PHP",
         "note": "Original receipt inspected and request ownership matched"
       }
     }
   ]
   ```

   Supply `refundAuditId` only for a supported confirmed full refund; the tool
   verifies its relationship to collection evidence. Supply optional `paidAt`
   only when the evidence establishes the actual payment time. Missing dates
   stay NULL. Do not fabricate a date, amount, audit, or reference to bypass review.
4. With `MIGRATION_DATABASE_URL` explicitly set by the operator, preview with
   `npm run db:reconcile-money -- --file <verified-evidence.json>`. It reports only
   change/unchanged counts and rolls back its read-only transaction. It loads no
   `.env` file and calls no providers. Verify the reviewed manifest and target
   datasource before any apply.
5. For an approved operational change, apply that reviewed file with
   `npm run db:reconcile-money -- --file <verified-evidence.json> --apply --actor <operator-id>`.
   This writes evidence-linked canonical records and `MONEY_RECONCILED` audit
   entries, updates request versions, and preserves legacy amounts/quotes/status.
   Cash receipt references are hashed for canonical uniqueness; the restricted
   audit retains the reference and verification note. A duplicate receipt across
   orders or a stale/conflicting row rejects the whole batch. Refresh versions
   and re-review evidence after a conflict; do not overwrite canonical records.
6. Verify report/receipt results against the reviewed evidence and retain the
   manifest with the operational change record. Unknown, ambiguous, or unsupported
   evidence remains unresolved; use a separately reviewed recovery change rather
   than manufacturing amounts. After actual collections exist, rollback requires
   an evidence-preserving operational plan; do not drop the table or resume legacy
   rounded writers as a rollback shortcut.

No application database migration or historical reconciliation was run during
this batch. Staging/provider integration, native PostgreSQL concurrency and scale,
and real historical evidence review remain release work.

## Validation and changed files

- **580 Vitest tests in 27 files passed**, including 16 new real database money
  integration cases, 18 evidence/validation cases, and 6 receipt render/auth cases.
  Database tests use an owned in-memory PostgreSQL instance, real Prisma/`pg`
  drivers, all nine migrations, and synthetic rows/provider responses. Coverage
  includes exact 15050-centavo online values, zero cash, replay idempotency,
  conflicting money rollback, cash batch rollback, pre-POST refund collection
  claims, confirmed refunds, evidence preview/apply, stale manifests, reused cash
  receipts, NULL-to-known payment dates, and preserved historical amounts.
- **58 isolated Google Chrome checks passed**, including finance CSV/PNG exports,
  account changes, error recovery, and the existing staff/student/navigation flows.
  Synthetic auth/API/action fixtures exercise real components; they do not test
  live Clerk/PayMongo credentials or a deployed application. The updated downloaded
  [finance PNG](assets/15-finance-report.png) was visually reviewed.
- **All four migration scenarios passed**, with zero Prisma drift and repeat
  deployment across the nine-file chain. Populated legacy records retain their
  amounts and do not acquire inferred canonical collections.
- TypeScript, focused ESLint, production build, and loopback cron HTTP checks
  passed. Full repository lint retains **14 errors / 20 warnings**, including
  six pre-existing student-client errors reserved for batch 16. Lint-gated CI
  remains blocked by that existing backlog. Diff whitespace/conflict checks passed.
- No dependency versions changed; the dependency audit was not repeated.

| Area | Files |
| --- | --- |
| Schema/migration | `prisma/schema.prisma`, `prisma/migrations/20261111000800_verified_money/migration.sql`, `scripts/test-migrations.mjs` |
| Canonical money/evidence | `src/lib/monetary-ledger.ts`, `monetary-evidence.ts`, `money-format.ts`, `scripts/reconcile-money.mjs`, `package.json` |
| Runtime writers | `src/app/actions/request.actions.ts`, `admin.actions.ts`, `src/lib/paymongo-webhook.ts`, `paymongo.ts`, `cancellation-refunds.ts`, `cancelled-payment-reconciliation.ts` |
| Monetary consumers | Finance data/model/client/API, `src/app/(admin)/admin/students/students-data.tsx`, `student-client.tsx`, `src/app/(print)/receipt/[id]/page.tsx`, `receipt-client.tsx` |
| Coverage | New monetary integration/evidence/receipt tests and money fixture; updated finance, payment, checkout, refund, action, and browser fixtures; `vitest.setup.ts` |
| Documentation | `README.md`, batch-14 follow-up link, this report, `assets/15-finance-report.png` |

Local batch-15 implementation criteria are met. Real historical records remain
unverified until operators execute the reviewed release/reconciliation procedure.
**Batch 16 is the student-management refactor.** No commit, push, merge, destructive
Git operation, deployment, live database write, real financial operation, or
message to another person was performed. Installed Next.js guides, Postgres
best-practice guidance, and the React component checklist informed the work.
