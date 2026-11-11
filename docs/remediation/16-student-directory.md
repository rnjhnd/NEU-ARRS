# Batch 16: Student directory correctness and refactoring

Implemented locally on 2026-11-12, following [batch 15](15-verified-money.md).
The first-100-account sample is replaced by a bounded complete-directory read,
shared by initial rendering and a staff-only refresh API. Earlier monetary,
workflow, notification, and navigation changes are preserved. No real account,
provider, database, deployment, or Git history was changed.

## 1. Codebase architecture and design

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | Old `src/app/(admin)/admin/students/students-data.tsx`; replacement `src/lib/student-directory-data.ts` | Only the first 100 Clerk accounts were loaded before staff filtering, while the UI claimed a complete student list. The shared loader now pages through accounts, checks counts/uniqueness, filters students on the server, and rejects incomplete/oversized reads. Initial rendering and `/api/admin/students?format=directory-v1` share this read path. |
| Medium | `student-directory-model.ts`, `student-directory-fetcher.ts`, student client/table | One component combined filtering, untyped sorting, pagination, repeated map lookups, metrics, and rows. A strict snapshot DTO and pure view model now own validation and stable sorting/pagination. The client owns session-aware refresh; a separate typed table renders rows and headers. |
| Medium | Student page/data/client | Initial fetch failures had no useful recovery state. Failed reads now show an unavailable state without fabricated counts. Transient refresh failures retain the last verified snapshot, explicitly identify it as stale, and offer recovery. |

### Read contract and capacity

- Existing **administrator and employee** permissions are preserved. Both initial
  and API reads verify server identity/role before Clerk or Postgres IO. No
  directory management mutations were added.
- The DTO contains only student ID, display name, primary email, HTTPS avatar URL,
  request/review counts, and verified centavos. Secondary addresses, private/unsafe
  metadata, whole provider users, request details, and provider references are not
  serialized. Missing primary emails remain missing.
- Explicit `student` and unset legacy roles are listed. Administrator, employee,
  and unrecognized roles are excluded.
- Reads use 500-account provider pages, ascending creation order, and a limit of
  **5,000 total Clerk accounts**, including staff. A response can contain at most
  **2,000,000 UTF-8 bytes**. Excess capacity returns 413; short, duplicate, or
  count-inconsistent scans return 503. Neither becomes a successful partial list.
- The installed SDK and [documented user-list parameters](https://clerk.com/docs/reference/backend/user/get-user-list)
  provide pagination and ordering but no role-metadata filter. The server inspects
  accounts before forming its student-only snapshot: at most ten provider calls
  per successful scan, without introducing a synchronized local identity table.
- This is a **bounded complete snapshot**, with ten-row local UI pages and global
  matching/sorting. Larger registries need a dedicated paged directory/read model
  with reviewed identity synchronization. Increasing the numeric cap alone is not
  the intended scaling solution.
- Clerk offset pages do not form an atomic transaction. Stable ordering, duplicate
  checks, exact page lengths, and unchanged provider totals reject detectable scan
  changes, but cannot catch every concurrent role/profile change or equal-count
  replacement. Clerk and Postgres cannot share a transaction. The UI shows when
  the read completed and offers refresh; it is not a permanent identity ledger.

## 2. Code quality and refactoring

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | `student-client.tsx`, `directory-table.tsx` | An inline `SortableHeader` recreated component types during render and sorting used `any`. Module-level typed headers now retain keyboard focus, expose `aria-sort`, and use fixed sort keys. Sort changes reset the page; ID ties are deterministic in either direction. |
| Medium | `student-directory-model.ts`, client | Sorting could leave users on later pages; a smaller refreshed list could produce an empty page despite matching users. Search/sort changes reset pagination, and a pure derived view clamps pages after refresh. Empty results show `0–0`, one valid page, and disabled navigation. |
| Medium | Client/table/model | Legacy `ltv`/revenue naming obscured the batch-15 monetary basis. DTO fields and UI now identify verified settled collections, with integer centavos and separate unverified counts. Normalized search covers names and primary emails. Totals are explicitly directory-wide while search narrows the table. |
| Low | Table and page | Search lacked a visible label, sort state was inaccessible, and an empty row spanned five cells for four columns. Search now has a label, headers expose order, the table has a caption, empty rows span four cells, and pagination has named navigation/live status. The hero no longer promises individual request history that the directory does not render. |

Money retains batch 15's eligibility rule: online `PAID` qualifies unless
cancelled/refunded; cash qualifies only when completed with `PAID` or
`CASH_ON_PICKUP`. Missing canonical collections count for review and are excluded
from monetary sums. Real zero stays zero. Legacy `amountPaid`, quotes, and current
document prices never supply collection values. This is a settled original-value
measure, not a payment-date, partial-refund, or net-revenue ledger.

## 3. Security vulnerabilities and data isolation

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `student-directory-data.ts`, `src/app/api/admin/students/route.ts` | Reusable reads require their own authorization, not only a page guard. The shared loader and API guard check staff identity/role before IO. The API versions its contract, rejects extra/duplicated controls, sets `private, no-store`, and sanitizes errors without provider/SQL details. |
| High | Client/fetcher/model | Previously rendered directory PII had no account-change handling. Loading auth hides the workspace; account/role changes unmount it. SWR keys include actor and role; initial/refreshed snapshots must match them. HTTP 401/403/404 and redirected refreshes hide cached rows; late responses cannot re-display data after an account switch. The installed Clerk SDK documents protected API 404 responses for signed-out users, so this fixed directory endpoint treats them as an access-verification failure. This isolates rendering/cache access, rather than erasing previously viewed browser memory. |
| Medium | Projection and grouped query | Full identity records and individual request histories are unnecessary. The server projects display fields, queries only verified student IDs, and binds SQL parameters. Unknown roles are excluded, and unexpected aggregate owners fail closed. |
| Medium | Model/data loader | Duplicate records, inconsistent totals, unsafe sums, oversized payloads, and unexpected properties can produce misleading responses. Runtime schemas validate the complete DTO and totals. PostgreSQL integer aggregates require safe JavaScript integer conversion; incompatible totals fail rather than round. |

No roles or metadata were written. Existing proxy rate limiting and deployment
credential configuration are unchanged. All verification used synthetic identities
and owned databases, with no real provider credentials.

## 4. Dead code and unused paths

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | Old student client/data | Loose `SerializedUser`, separate count/value/review map props, repeated metric reductions, ad hoc sort comparisons, and inline headers are superseded by a validated DTO and view model. Their active paths are removed. All repository consumers use the new prop contract. |
| Low | Student client imports/rows | The unused Next Image import, direct unoptimized `<img>`, and local Framer Motion/AnimatePresence row machinery are removed. The shared avatar supplies fallback behavior. No new dependency was installed. |

Earlier batch files/assets remain intact. No unrelated components, migrations, or
historical monetary fields were removed.

## 5. Performance and reliability

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `loadDirectoryAggregates` in `student-directory-data.ts` | Every selected student's request rows were transferred into Node for reductions. One parameterized grouped SQL statement now joins canonical money, counts requests/review items, and sums verified centavos. It returns at most one aggregate per student and supplies one consistent database read. Existing student-ID and money-primary-key indexes support it; no migration is needed. |
| Medium | Clerk scan | The loader enforces account/page/response bounds and rejects scans when more than 20 seconds have elapsed after a provider page returns. The browser uses a 30-second timeout. The SDK has no per-call abort signal here: an already-running provider read may finish after a browser abort, but cannot cause an unbounded scan or writes. |
| Medium | Client refresh | Repeated full-provider polling adds load. There is no interval polling, duplicate mount refresh with matching initial data, or automatic error retry loop. Focus/reconnect refreshes are deduplicated/throttled for 60 seconds. Manual refresh remains available and is disabled while pending. |
| Medium | View/table | Matching/sorting are memoized for a bounded snapshot; only ten rows render per page. Failed/malformed refreshes preserve verified rows, initial failures show no invented zero metrics, and recovery replaces the snapshot and clamps pagination. |

All-time aggregation still scans relevant request history. The 6,000-request
fixture verifies grouping/isolation, not production-scale latency. At larger
history/registry scale, pre-aggregated read models and synchronized directory
paging remain capacity work. Native database/provider concurrency and live
deployment integration were not exercised.

## Validation

- **615 Vitest tests in 30 files passed**. The 35 new directory cases comprise
  18 loader/API checks, 13 model/fetcher checks, and four database checks. Coverage
  includes authorization before IO, 505-account pagination, the exact 5,000-account
  boundary, payload/time bounds, incomplete scans, primary email projection,
  no-request students, deterministic sorting/page clamping, safe totals, and
  canonical monetary eligibility. Real Prisma/`pg` adapters queried owned in-memory
  Postgres with all nine migrations and 6,010 synthetic requests.
- **73 isolated Google Chrome checks passed**: all 58 prior navigation/history/
  queue/finance checks plus the final 15 directory checks. New coverage includes
  keyboard focus, search/pages, exact/zero values, slow/malformed/failed refreshes,
  initial actor mismatch, account/role changes, authorization rejection, late
  responses, capacity errors, protected-route 404 responses while session hooks
  remain stale, and phone layout. Auth/API/action fixtures are synthetic; this does
  not verify live Clerk sessions or a deployed application URL.
- The [phone screenshot](assets/16-student-directory.png) was visually reviewed.
  It includes fixture-only account controls. The page fits the viewport; the
  directory table intentionally scrolls horizontally for its remaining columns.
- TypeScript, focused ESLint, production build, and loopback cron HTTP checks
  passed. The build/HTTP harness owns its database and uses synthetic credentials.
  `.next` is verification output: rebuild with intended configuration before release.
- Full lint improves from **14 errors / 20 warnings** to **8 errors / 18 warnings**.
  All six student-client errors and two warnings are resolved. Remaining document/
  settings, auth, and new-request issues still block lint-gated CI.
- Diff whitespace/conflict checks passed. No schema, migration, dependency version,
  or environment configuration changed, so migration CLI/dependency audits were
  not unnecessarily repeated. Integration tests replay all nine existing migrations.

## Rollout, remaining work, and files

Release the server wrapper, directory API, model/fetcher, and client/table together,
then reload open staff directory tabs. Batch 16 needs no new environment variable
or migration. Earlier migration and historical reconciliation requirements still
apply, including `RequestMoney` availability. No live release operation was run.

Local batch-16 criteria are met: accounts beyond the former sample are included
within explicit bounds; aggregation preserves verified monetary meaning; staff and
snapshot identity checks protect data; sorting, paging, and recovery are tested;
and the directory's lint failures are gone. Larger-directory synchronization/paging
and live deployment verification remain stated capacity/release work. The audit
continues with **batch 17: document and settings refactoring/validation**.

| Area | Files |
| --- | --- |
| UI | `src/app/(admin)/admin/students/page.tsx`, `students-data.tsx`, `student-client.tsx`, `directory-table.tsx` |
| Model/read/fetch | `src/lib/student-directory-model.ts`, `student-directory-data.ts`, `student-directory-fetcher.ts` |
| API | `src/app/api/admin/students/route.ts` |
| Unit/database coverage | `src/lib/__tests__/student-directory-model.test.ts`, `student-directory-data.test.ts`, `student-directory-integration.test.ts` |
| Chrome fixture/checks | `scripts/student-directory-fixture/index.html`, `entry.tsx`, `scripts/navigation-checks/student-directory.pw.ts`, `scripts/navigation-fixture/server.mjs` |
| Documentation | `README.md`, batch-15 follow-up link, this report, `assets/16-student-directory.png` |

No commit, push, merge, destructive Git operation, deployment, real financial
operation, live database write, or message to another person was performed.
Installed Next.js guides, React best practices, Clerk auth guidance, and Postgres
batching/index guidance informed the work.
