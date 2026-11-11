# Batch 12: Server-side student history pagination and polling

Implemented locally on 2026-11-11, following [batch 11](11-student-request-state.md).
The dashboard now requests one server-sorted page of at most ten rows and
database-derived whole-history counts. This batch prepares an additive index
migration; it does not apply it to the application database, deploy code, change
provider settings, or change the daily notification cron schedule.

## 1. Codebase architecture and design

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | `src/lib/student-request-data.ts`, `src/app/(student)/dashboard/request-list.tsx` | The server loaded every owned request and the browser sorted/sliced the entire history. Sorting, page bounds, row limiting, and summary aggregation now run in the database. Both initial server rendering and the API use the same loader. The client retains interaction state and renders the returned page. |
| Medium | `src/lib/student-request-model.ts`, `src/lib/student-request-fetcher.ts`, `src/app/api/student/requests/route.ts` | A full-history response cannot represent server pagination without misleading older consumers. A versioned `history-v2` envelope now includes `items`, `summary`, `query`, `totalPages`, and the authenticated owner ID. The fetcher validates the shape and checks the response owner, requested sort, direction, and clamped page. |

Example request:

```text
/api/student/requests?format=history-v2&page=2&sort=updatedAt&direction=desc
```

`summary` contains total, active (neither completed nor cancelled), and completed
counts across all of the student's requests. These counts do not depend on the
visible page. The count query and limited row query run in one short
`REPEATABLE READ` transaction, so a concurrent status change cannot make a single
response combine incompatible page bounds and counts. Each later refresh starts
a new snapshot; this is not a frozen multi-page export.

## 2. Code quality and refactoring

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | `student-request-model.ts`, `student-request-data.ts` | Pagination and sort rules needed a shared contract. One typed query schema supplies defaults, accepted fields, direction, and page bounds. Row ordering always includes an ID tie-breaker. The page is clamped after counting, including empty or shrinking histories. |
| Medium | `student-request-data.ts` | Sorting persisted document codes or Postgres enums directly would change the displayed ordering. The query sorts configured/fallback document labels and casts enums to text for alphabetical sorting. Label/enum comparisons use `C` collation. IDs use their normal database collation, matching the default history index. Legacy labels come from the same registry as serialization. |
| Low | `request-summary.tsx`, `request-list.tsx` | Computing counts from a limited page would undercount. The cards now accept the server summary directly; pagination labels use the full total. Sort changes still return to page one, and sort/page interactions clear expansion. |

The SWR key includes owner, page, sort, and direction. Previous verified rows may
remain visible while a new page loads, with a loading status and disabled
mutation controls. A failed page read keeps verified data and offers manual
retry. Late responses for another sort cannot replace the active key. Confirmed
cancellations update matching rows in all cached history pages for that owner,
then revalidate active subscriptions. Version checks prevent an older action
result from replacing newer polled state. Page/sort navigation is guarded while
a payment or cancellation is pending/open.

## 3. Security vulnerabilities and safeguards

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | `src/app/api/student/requests/route.ts` | Server pagination introduces caller-controlled query parameters. The API authenticates first, then accepts only whitelisted sort fields/directions and integer pages from 1 through 100,000. Empty, fractional, negative, exponential, excessive, or repeated control parameters fail with a private, non-cacheable 400 before database access. Page size is fixed at ten. |
| Medium | `src/lib/student-request-data.ts` | Dynamic ordering must not become SQL injection. Identifier/order fragments are fixed application constants; owner IDs, legacy label values, limits, and offsets use Prisma-bound parameters. Both count and row queries include the authenticated owner predicate. No unsafe raw-query API or caller-provided identifier is used. |
| Medium | `student-request-fetcher.ts`, `request-list.tsx` | Wrong-page or wrong-sort data could otherwise become actionable. Invalid envelopes are rejected; personal history remains hidden on identity mismatch, authorization failure, or redirected authentication responses. Data and error responses retain `private, no-store`. The projected rows still exclude names/numbers and payment/provider internals. |

Unknown/non-pagination query fields never establish ownership or enlarge the
page size. Existing server-action authorization and workflow checks remain the
final authority for payments and cancellations.

## 4. Dead code and unused files

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Low | `student-request-model.ts`, `request-list.tsx` | Removed the client full-history `requestPage` sorter, its memoization, and the now-unused runtime Prisma projection object. A structural display-row type and explicit SQL selection retain the minimal serialization contract. No orphaned component or asset deletion was required. |

## 5. Performance and reliability weaknesses

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `student-request-data.ts` | Every five-second refresh transferred and sorted the full history. The database now returns one aggregate row and at most ten display rows; document labels are joined for that page rather than loading the complete document-config table. Application/browser memory and response row count no longer scale with all historical requests. |
| Medium | `prisma/schema.prisma`, `prisma/migrations/20261111000600_student_history_pagination/migration.sql` | Added `(studentId, updatedAt DESC, id)` for default history ordering and `(studentId, status)` for owner-scoped summary scans. The real disposable-database plan test verifies the default joined page-query shape can use the history index. Other sort options may still require database sorting. |
| Medium | `request-list.tsx`, `student-request-model.ts` | Fixed five-second polling continued even for settled histories. Histories with active requests now refresh at 30 seconds; histories without active requests have no interval. Focus, reconnect, and manual refresh still revalidate, and newly active data restarts polling. Hidden/offline interval requests are disabled. Authentication errors avoid automatic retries; other retries remain bounded. |
| Medium | `request-list.tsx` | SWR's interval callback can initially receive no cached data even when server fallback data is displayed. Scheduling now includes that verified fallback and is re-evaluated on render, including transitions from settled to active after manual/focus/reconnect recovery. Browser clock tests cover this initialization and restart path. |

### Deliberate limits

Numbered pages retain offset pagination to support the existing six sort modes,
page totals, and clamping behavior. Offsets scan skipped matches; this does not
provide constant-time deep navigation. Summary aggregation still examines the
student's matching history, and label/enum sorts can process all matches inside
Postgres. The optimization bounds returned/application rows and reduces
background request frequency; it does not claim constant total database work.
Keyset navigation is an alternative if measured production history sizes require
it, with corresponding navigation/sort design changes.

Live updates can shift rows between numbered pages between responses. The ID
tie-breaker makes ordering deterministic for each snapshot, without promising a
duplicate-free walk across concurrent updates. Status-change toasts compare
visible rows; off-page changes update summary counts on refresh. Existing durable
notification delivery is independent of the visible page.

Cached pages are last-verified views, not real-time snapshots. Refresh on page
selection obtains new summary counts, and mutations are disabled during
revalidation. No new cross-user or server response cache was introduced.

## Migration and rollout

The new file is the seventh migration in the complete chain. It adds indexes
only; request data and prior migration files are unchanged. The migration harness
now applies this file in both fresh deployment and populated legacy upgrade
scenarios. All four local scenarios pass, including zero Prisma schema drift.

Use the existing [migration procedure](04-migration-alignment.md) and explicit
`MIGRATION_DATABASE_URL` when scheduling an actual release. Index creation can
hold write locks while building; schedule the ordinary migration appropriately
for the target database. No live connection or migration was attempted here.

Deploy the API and dashboard changes together. Unversioned and `history-v1`
requests now receive a non-cacheable 409 asking the user to reload the dashboard;
they do not invoke an unbounded compatibility query or return a silently
truncated history. Older open tabs must perform a full browser reload. This
supersedes batch 11's temporary legacy-array compatibility.

## Verification

- **470 Vitest tests passed across 19 files.** Eleven real-adapter database tests
  create owned in-memory PostgreSQL instances, replay all migrations, and exercise
  the actual Prisma loader. Coverage includes every sort/direction across four
  pages, deterministic ties, configured/legacy labels, global summary counts,
  owner isolation, empty/clamped pages, injection-like inputs, 5,001 requests,
  and the default index query plan. Route tests verify auth, private responses,
  retired formats, invalid/duplicate controls, and database failures. Model/fetch
  tests validate bounded envelopes, response/query matching, mutation counts,
  and polling rules.
- **29 Chrome browser checks passed:** nine navigation checks and twenty student
  history checks. Seven additional history regressions cover server page/count
  contracts, slow/failed navigation, out-of-order sort responses, the 30-second
  interval, settled polling/reconnect/restart, off-page summary updates, and
  cancellation preservation across cached sorts. Prior account/session,
  cancellation, payment-race, focus, and phone-layout checks still pass.
- **All four migration scenarios passed**, including fresh deployment, populated
  legacy upgrade/backfill recovery, repeat deployment, zero drift, and existing
  checkout/lease/identity checks. Native PostgreSQL CI was not run locally.
- TypeScript and focused ESLint passed. Full repository lint is unchanged at
  **36 errors / 23 warnings** in other feature files, so lint-gated CI is still
  not green.
- Production build and loopback cron HTTP checks passed with an owned disposable
  database and synthetic provider keys. The generated `.next` build is for
  verification only; rebuild with intended configuration before deployment.
- No dependency changes were made; the dependency audit was not repeated.

Browser checks run the real components, SWR, CSS, Base UI, and response validator
against synthetic API/action/auth adapters. Their server excludes application
environment files, rejects other-origin page requests, and asserts no page
errors. Database tests use owned sockets and synthetic rows, never application
credentials. Full authenticated production integration and production latency
measurements remain release checks.

The local acceptance criteria for batch 12 are met. The next planned batch is
**batch 13: admin request queue refactoring**.

Follow-up: [batch 13](13-admin-queue-refactoring.md) implements the staff queue
refactoring and extends the browser suite to 45 checks. The figures above remain
the original batch 12 verification baseline.

## Files changed in this batch

- `src/lib/student-request-model.ts`, `student-request-data.ts`,
  `student-request-fetcher.ts`
- `src/app/api/student/requests/route.ts` and `__tests__/route.test.ts`
- `src/app/(student)/dashboard/request-list.tsx`, `request-summary.tsx`
- `src/lib/__tests__/student-request-model.test.ts`, `student-request-data.test.ts`
- `scripts/navigation-checks/request-list.pw.ts`, `scripts/test-migrations.mjs`
- `prisma/schema.prisma` and the additive index migration above
- `README.md`, `docs/remediation/11-student-request-state.md`, and this report

No commit, push, merge, deployment, or destructive Git operation was performed.
Earlier remediation work remains preserved. Version-matched Next.js route docs,
the Postgres pagination/index guidance, and the React component review were used.
