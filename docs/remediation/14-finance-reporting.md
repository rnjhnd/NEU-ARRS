# Batch 14: Finance dashboard correctness and performance

Implemented locally on 2026-11-11, following
[batch 13](13-admin-queue-refactoring.md). This batch fixes the reporting and
export paths without migrating monetary storage or changing payment/refund
workflows. An additive reporting index is prepared; nothing was applied to the
application database or deployed.

Follow-up: [batch 15](15-verified-money.md) supersedes the quote-based value source
below with evidence-linked collections and prepares historical reconciliation.
This report and its image describe the batch-14 state.

## 1. Codebase architecture and design

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | `src/app/(admin)/admin/finance/finance-client.tsx`, `finance-charts.tsx`, `src/lib/finance-model.ts` | One component combined mutable date logic, repeated revenue calculations, custom chart components, and downloads. A pure typed model now supplies one report for cards, charts, accessible data tables, and CSV. A separate chart module renders stable components; the client owns filters, verified snapshots, refresh state, and exports. |
| Medium | `src/lib/finance-data.ts`, `src/app/api/admin/finance/route.ts`, `src/app/(admin)/admin/finance/finance-data.tsx` | Initial rendering fetched and serialized every complete request record. Initial loading and the new API share an administrator-only loader that filters submitted dates in Postgres, selects minimal fields, and limits rows. The client receives no names, student numbers/ownership IDs, provider references, legacy amounts, or notification metadata. |

### Report meaning and monetary boundary

The report is now named **Settled Request Values**. It measures saved request
prices for qualifying settled requests, rather than claiming to be a payment-date
or net-revenue ledger:

- Online requests qualify when marked `PAID` and not cancelled/refunded.
- Cash requests qualify when completed and marked `CASH_ON_PICKUP` or `PAID`.
- Known values come only from the immutable `quotedAmountCentavos` snapshot.
  Zero is a valid price. Current document prices are never substituted.
- A qualifying request without a valid saved price is counted as needing review,
  included in the detail CSV with a blank monetary value/review explanation, and
  excluded from monetary totals. Its legacy `amountPaid` units are not inferred.
- Cancelled/refunded requests are excluded from this defined measure. Cancelled
  requests still marked paid receive a separate reconciliation warning; their
  money is not silently represented as a completed refund or net revenue.

This definition and the report's submitted-date basis appear in the UI and PNG.
Every CSV value declares its basis. Canonical collected amounts, historical unit
verification/backfill, payment dates, and refund-ledger accounting remain batch
15 work. No stored monetary field or historical value was rewritten here.

## 2. Code quality and refactoring

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | Old `finance-client.tsx` amount helper; replacement `finance-model.ts` | Truthiness treated an actual zero like a missing amount and invented a 150-PHP cash fallback. Mixed-unit historical integers were also displayed as PHP. That helper was removed. Known saved prices remain integer centavos during aggregation; missing/invalid quotes are explicitly unverified, never converted from legacy values or current prices. |
| Medium | `finance-model.ts`, `finance-client.tsx` | Local browser dates and formatted month/day strings could change report membership across timezones, merge different years, admit future rows, or create fictitious padding months. Queries use an explicit Manila UTC+08 calendar and the server snapshot time. Inclusive custom end dates use a next-day exclusive boundary; reversed dates normalize, both dates are required, and future custom dates are rejected. Day/month/year keys include their year and sort chronologically without parsing display labels. A single observed point stays a single point. |
| Medium | `finance-charts.tsx`, `finance-client.tsx` | Inline tooltip/legend/dot components and `any` props produced React/TypeScript lint failures and unstable rendering. Module-level typed components replace them. Chart animations are disabled for deterministic captures; numeric formatters consistently display two PHP decimal places. Date draft changes cannot enable export until applied. |

The seven-/thirty-day views contain at most thirty-one daily buckets. This-year
views use monthly buckets through the snapshot month, including January without
mixing daily and monthly keys. Longer views use observed year-month keys, or
year keys for long spans. The document display contains the top twelve labels
plus an exact remaining-label total, preserving the overall value. Every chart
has a labelled tabular alternative.

## 3. Security vulnerabilities

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `finance-client.tsx`, `finance-fetcher.ts`, finance API | Existing client props could remain visible after the administrator account/role changed. The new read path checks administrator authorization before database access, returns private/no-store responses, and uses an actor-scoped SWR key. Responses must match the actor and requested period and pass shape/date/money/size validation. Account/role changes, authorization failures, and followed login redirects hide the cached report. |
| Medium | `src/lib/csv.ts`, `finance-model.ts`, `admin-queue-model.ts` | Finance CSV interpolated unescaped fields. The shared CSV-cell encoder now quotes complete fields, doubles embedded quotes, preserves multiline values, neutralizes spreadsheet formula/control prefixes, and avoids `undefined` values. The staff queue uses the same helper; its existing CSV regression checks still pass. Download object URLs are released. |
| Medium | `finance-client.tsx` PNG export | An asynchronous image generation could finish after an identity change, or capture a changing report/filter. PNG export freezes the verified dataset and controls, checks active authorization state before/after rasterization, and prevents duplicate activation. Late results do not download or notify another account. Failed generation clears pending state and permits retry. |

The API uses `/api/admin/finance?format=finance-v1` with whitelisted period/date
controls. Invalid/duplicate controls fail before request queries; non-admins
receive 401/403, oversized reports 413, and unexpected failures a sanitized 500.
Errors and success responses all use `Cache-Control: private, no-store`.
Server authorization remains authoritative; hiding controls does not grant or
revoke a role. No payment, refund, role-management, or email operation was added.

## 4. Dead code and unused files

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Low | `finance-client.tsx`, `finance-data.tsx` | Removed the full Prisma client prop, `as any` cast, duplicated legacy label map, guessed-amount helper, repeated per-bucket request scans, nested chart components, fake prior-month padding, export delay, and unused motion/date-picker/popover/select imports. The image library is now imported only when a PNG is requested. Shared date-picker/UI modules and dependencies remain because other features use them. |

No unrelated component, shared primitive, dependency, or previous remediation
asset was removed. New browser fixtures are intentional development-only tests.

## 5. Performance and reliability weaknesses

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `finance-data.ts`, finance API | Loading every complete historical record into the browser made every render/filter costly and exposed unnecessary fields. Date filtering now occurs in Postgres. The query returns only report fields and at most 5,001 rows as an over-limit sentinel; more than 5,000 produces an explicit error, not silently truncated totals. Label lookups are limited to document types in the selected cohort. |
| Medium | `prisma/schema.prisma`, `prisma/migrations/20261111000700_finance_period_index/migration.sql` | Added `(createdAt, id)` for submission-date range reads with stable ordering. The actual-adapter test confirms a representative range/order query can use this index. The migration is additive and index-only. |
| Medium | `finance-model.ts`, `finance-client.tsx` | Each time/document bucket repeatedly scanned the full dataset, and calculations reran during unrelated interactions. One pass accumulates eligible values into maps, followed by small grouping/sorting steps; the client memoizes the report by snapshot. Totals, payment methods, trends, and the document rollup share the same calculation and integer-centavo sums. |
| Medium | `finance-client.tsx`, `finance-charts.tsx` | Refresh errors, initial loader failures, unapplied dates, and in-flight period changes could otherwise produce misleading exports. Verified previous snapshots retain their own labelled period; failures disable exports. Failed initial loads show no fabricated zero cards and retain working filters/refresh controls. SVG animations and fixed capture sleeps are gone. Phone PNG review caught a clipped fixed-width document chart; responsive native bars now show complete labels and values. |

### Dates, freshness, and scaling limits

Filters refer to request **submission dates**, with a fixed Manila UTC+08 day
boundary and a server-generated snapshot timestamp. `updatedAt` is not called
`Date Paid`; neither the UI nor CSV invents a payment timestamp. Future-created
rows are excluded even if they fall within the current calendar year/day. The
snapshot time anchors cohort membership and report generation, not a historical
accounting reconstruction of every subsequent status/refund event.

Finance revalidates on focus, reconnect, and manual refresh, without background
interval polling. A refresh or period change can update the snapshot; an ongoing
PNG keeps its captured dataset. The existing student/staff polling policies and
daily notification fallback are unchanged.

The 5,000-row cap is deliberate. Large/all-time reports must be narrowed;
database-side financial aggregation and a streamed full-ledger export are not
implemented. Returned rows are bounded, but query planning still depends on the
target database and index/statistics. This batch does not claim constant-time
queries, complete historical collections, gross/net cash flow, or canonical
currency reconciliation.

## Verification and acceptance

- **540 tests passed across 24 files** using
  `npx vitest run --maxWorkers=2`. Thirty-nine new tests cover date/quote/report
  semantics, zero and unknown amounts, consistent chart totals, CSV escaping,
  admin-only reads, private errors, query validation, future rows, oversized
  reports, and real-adapter Postgres filtering/index behavior. The existing
  staff CSV and financial-workflow tests remain passing.
- An initial default-worker run had **539 passes and one timeout** in the
  existing TypeScript parser compatibility test while production-build/browser
  checks were running concurrently. The full two-worker retry passed without
  modifying test timeouts, assertions, or dependency configuration. No finance
  assertion failed; the timeout was not separately profiled.
- **58 isolated Chrome checks passed:** thirteen finance, sixteen staff queue,
  twenty student history, and nine navigation checks. Finance checks cover the
  known-price policy/warnings, custom and year/all-time periods, stale/failed and
  oversized report recovery, failed initial loads, CSV content, real PNG
  downloads, image failure/retry, frozen export controls, identity/role/session
  changes, and prevention of late downloads. They run in a Los Angeles browser
  timezone while asserting Manila cohort dates and totals.
- **All four migration scenarios passed**, including fresh deployment, populated
  legacy upgrade/backfill recovery, repeat deployment, and zero Prisma schema
  drift across the eight-file migration chain. No native PostgreSQL CI run or
  application database migration was performed.
- TypeScript and focused ESLint passed. Full repository lint is now
  **14 errors / 20 warnings**, improved from **30 / 21**. Remaining settings,
  student-management, and auth-feature issues still block lint-gated CI.
- Production build and loopback cron HTTP checks passed using an owned
  disposable database and synthetic provider keys. Rebuild with intended
  configuration before deployment; the generated `.next` artifact is for
  verification only.
- The actual downloaded PNG was visually reviewed after fixing the clipped
  phone chart. It includes its cohort, timestamp, value basis, review warnings,
  cards, charts, and complete document labels/values. See the
  [reviewed export](assets/14-finance-report.png).
- No dependencies changed, so the dependency audit was not repeated. Diff
  whitespace/conflict checks passed.

Browser fixtures use the real report model, components, SWR, chart library,
shared CSV encoder, and image encoder with synthetic auth/API data. Other-origin
page requests/service workers are blocked and page errors are asserted absent.
Database tests own in-memory PostgreSQL sockets and synthetic rows; they do not
use application credentials. Full authenticated deployment/provider integration,
native database concurrency, production-scale performance, and verification of
historical monetary records remain release/follow-up work.

The local acceptance criteria for batch 14 are met. **Batch 15 is consistent
monetary storage and historical reconciliation.** Its implementation must verify
historical provenance rather than automatically multiplying or dividing legacy
amounts.

## Rollout and changed files

Apply the prepared index through the existing
[migration procedure](04-migration-alignment.md), with an explicit migration
datasource and an appropriate release window: ordinary index creation can hold
write locks while building. No live migration was attempted. Ship the finance
API and dashboard together, and reload previously open finance tabs to replace
the old report definition. No new environment variable is required.

| Area | Files |
| --- | --- |
| Finance UI | `src/app/(admin)/admin/finance/finance-client.tsx`, `finance-data.tsx`, `finance-charts.tsx`, `page.tsx` |
| Report model/data | `src/lib/finance-model.ts`, `finance-data.ts`, `finance-fetcher.ts`, `src/app/api/admin/finance/route.ts` |
| Shared CSV | `src/lib/csv.ts`, `src/lib/admin-queue-model.ts` |
| Tests | `src/lib/__tests__/finance-model.test.ts`, `finance-data.test.ts`, `src/app/api/admin/finance/__tests__/route.test.ts` |
| Browser coverage | `scripts/navigation-fixture/server.mjs`, `scripts/navigation-checks/finance.pw.ts`, `scripts/finance-fixture/index.html`, `entry.tsx` |
| Schema/migrations | `prisma/schema.prisma`, the additive finance index migration above, `scripts/test-migrations.mjs` |
| Documentation | `README.md`, `docs/remediation/13-admin-queue-refactoring.md`, this report, `assets/14-finance-report.png` |

Earlier remediation work is preserved. No commit, push, merge, deployment,
destructive Git operation, live database write, or real financial/provider
operation was performed. Installed Next.js client-boundary/route guides,
Postgres index guidance, and the React component checklist were used.
