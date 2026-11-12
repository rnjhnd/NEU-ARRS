# Batch 20: final cleanup and performance review

This final planned batch closes the full-feed staff queue and deprecated email
component follow-ups from batches 13 and 19. It also removes verified unused UI
files. Existing batches 18 and 19 remain preserved and uncommitted. No application
database, real account, payment, email delivery, deployment, or Git commit is used
by this work.

## 1. Codebase architecture and design

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `src/lib/admin-queue-data.ts`, `src/app/api/admin/requests/route.ts`, `src/app/(admin)/admin/admin-queue-client.tsx` | The browser previously received every request and filtered, sorted, and paginated the full collection. The versioned `queue-v2` contract now returns at most ten server-selected rows, exact filtered totals, and separate whole-queue summary counts. Staff authorization is verified before loading request/profile data. |
| Medium | `src/app/api/admin/requests/export/route.ts`, `src/lib/admin-queue-fetcher.ts` | CSV generation depended on downloading the entire collection during normal navigation. A separate authenticated, private/no-store endpoint now exports all statuses independently of table filters. Optional inclusive creation dates use Asia/Manila. Exports exceeding 5,000 requests or 5 MB fail explicitly; users must narrow the creation dates. No partial-success export is returned. |
| Medium | `src/lib/admin-queue-query.ts`, `admin-queue-model.ts` | SQL filtering/order selection and the client contract needed explicit boundaries. A strict shared query schema validates the five supported sort fields, direction, status, page, and search. Fixed SQL fragments select columns; user values are bound parameters. The DTO excludes provider/payment internals and rejects truncated pages, duplicate IDs, inconsistent counts, and unexpected top-level fields. |

Old queue clients receive an authenticated private 409 and must reload. Release
the queue API, export endpoint, and client together. Numbered pages remain the
existing UX; deep `OFFSET` pages and exact counts still have database costs. This
change bounds transferred rows and profile enrichment, rather than making every
query constant time. Cursor pagination and indexed search are future options
when production query plans/load justify changing those semantics.

## 2. Code quality and refactoring

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | `src/emails/status-update-email.tsx` | Deprecated email components and a runtime Tailwind compiler complicated a small transactional template. Native React table markup with static inline styles now uses the maintained standalone `@react-email/render` package. Greeting, status, cancellation reason, multiline message, configured portal link, and registrar footer remain covered. External fonts and the remote image are removed. |
| Medium | `admin-queue-client.tsx`, `use-queue-update.ts` | Server pagination adds query races and multiple cached pages. SWR keys include actor, role, and query; a late response cannot replace a newer query. Confirmed action results patch cached rows by version, then refresh membership/counts. Failed refreshes preserve verified rows and confirmed changes while blocking further edits. The update hook receives named options instead of positional callbacks. |
| Low | `src/lib/__tests__/student-request-data.test.ts` | A test asserted one exact index name for an owner who represented nearly the entire database. New valid indexes changed the planner choice. The test now checks indexed owner access on a selective owner; index existence remains checked separately. Staff tests check ordered index access without a full sort for default/status pages. |

React review covered stable component identities, effect cleanup, account-scoped
caches, double-activation guards, typed options, labels, keyboard access, and
readonly stale states. The standalone email's literal `<head>` has a narrowly
scoped explanatory Next lint exception because it is email HTML, outside Next
document routing.

## 3. Security vulnerabilities

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | Queue/export routes and loaders | Both reads verify the current server actor/role, including student denial. Malformed query controls still require authorization, duplicates/unknown parameters are rejected, obsolete formats fail closed, and responses forbid caching. Redirects and identity/role mismatches are rejected before client use. Authorization failures hide cached staff data. Provider/database error details are not returned. |
| Medium | `admin-queue-query.ts`, `admin-queue-data.ts` | Search must not interpolate caller SQL or silently search a partial account roster. Stored fields use literal bound substring matching. Clerk query results are paged with stable totals, duplicate/completeness checks, a 5,000-profile cap, and a checked elapsed-time budget. Only primary email matches contribute IDs. Unknown completeness fails explicitly instead of reporting zero/partial results. |
| Medium | CSV fetcher/client and email template | CSV keeps formula neutralization and quote/newline escaping. Downloads verify actor/role, content type, header, and byte size. Account changes abort exports and suppress late downloads. Email user content stays JSX-escaped; its application URL must be HTTPS without credentials and resolves to the configured origin's `/dashboard`. |
| Medium, remaining | `package.json`: ESLint 9.39.5 | ESLint 9 remains end of support; compatible installed React/import/accessibility plugins still prevent a supported ESLint 10 peer graph. Track and upgrade the compatible toolchain together. Strict peers remain enabled; no unsupported override or blanket warning suppression hides this issue. The current advisory audit reports zero vulnerabilities, which does not establish lifecycle support. |

This changes rendering for newly prepared notification payloads only. Existing
frozen outbox payloads, delivery idempotency/recovery, financial rules, and the
user-selected daily cron fallback retain their existing behavior.

## 4. Dead code and unused files

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Low | `src/components/ui/calendar.tsx`, `popover.tsx`, `select.tsx` | Repository reference searches found no consumers. Remove these three orphaned wrappers. Existing native date inputs and other Base UI components remain in use. |
| Low | `package.json`, `package-lock.json` | Remove unused direct `react-day-picker` and development `dotenv` declarations, deprecated `@react-email/components`, and its now-unneeded scoped renderer override. Retain the supported renderer and the separate reviewed parser override. The lockfile loses 24 entries, adds none, and changes no remaining version. Deprecated entries fall from 21 to one (ESLint). Transitive dotenv use by tooling remains valid. |

The clean installation confirms removed component/calendar packages are absent.
Reference checks cover application code and fixtures. No logo, request tracker,
shared Base UI dependency, or other file with a known consumer was removed.
This is evidence for these specific deletions, rather than a guarantee that
every potentially unused symbol in the repository has been detected.

## 5. Performance and reliability weaknesses

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | Queue loader, Prisma schema, `20261112000200_staff_queue_pagination/migration.sql` | Full collection reads/profile lookups grew with queue size. The loader reads ordered page IDs and at most ten minimal request rows, enriching only represented student IDs. Two indexes cover the default updated-time order and status-plus-order query. Whole-queue summaries remain independent of page/search filters. A 1,007-request integration fixture verifies ten-row responses below 6 KB. |
| Medium | Queue/export database reads | Counts, labels, and rows could otherwise disagree across calls. Short Repeatable Read transactions capture each database view, with 2 s transaction acquisition, 8 s transaction lifetime, and 5 s local statement limits. Clerk calls run outside database transactions. Search/profile work has checked 20 s elapsed budgets; those checks do not themselves cancel an in-flight SDK call. Client reads/exports have 30 s abort timeouts. |
| Medium | Queue client | Query changes clear selection; pending/failed reads retain previous verified rows readonly. Only current-page versions can be submitted. Export failures are retryable, size failures recommend narrower dates, and pending downloads lock relevant controls. Account/role changes hide data and invalidate late effects. Active queues poll every 30 s; fully settled queues rely on focus, reconnect, or manual refresh. |
| Low | Email rendering | The same synthetic email shrank from 9,456 to 3,309 UTF-8 bytes (65%). An eight-render local sample measured cold render 122 to 39 ms and warm median 10.64 to 1.07 ms. These are local illustrative samples, not production latency guarantees. Phone rendering fits 390 px without outbound asset requests. |

Counts and arbitrary substring searches still scan matching database data;
non-default sorts and deep pages can be expensive. Profile enrichment is a
separate provider snapshot, not an atomic cross-system transaction. Production
load tests and native Postgres plans must guide further indexing/search changes.

## Validation and rollout

Verification uses a new ignored scratch copy, freshly installed from the lockfile
with strict peer/script policy and no application env files or generated types
copied in. Source/config hashes match the working implementation. Earlier
focused checks established the loader/template changes before interruption;
resumption added page/export race, denial, completeness, boundary, and recovery
coverage, corrected the brittle query-plan assertion, completed visual review,
and ran the final checks below.

- Clean `npm ci`, automatic Prisma generation, and `npm ls --all` passed.
  Install-script review reports no pending approvals. The removed email/calendar
  packages are absent from this fresh dependency tree.
- Type generation, TypeScript, and ESLint pass with zero errors/warnings.
  **781 tests in 39 files** pass, including real-adapter disposable database
  queue/search/export checks, provider completeness failures, role denial,
  whole-queue counts, stable sorting, CSV limits, and Manila date boundaries.
- The full dependency audit reports **zero vulnerabilities**. This does not
  close the ESLint lifecycle issue listed above.
- All **four disposable migration scenarios** pass with zero Prisma drift,
  exercising the complete eleven-migration chain and verified legacy upgrades.
- **114 Chrome checks** pass, including 23 staff-queue cases. New cases exercise
  1,007-row counts/page requests, failed page recovery, stale search responses,
  export-size recovery/date queries, duplicate export guards, authorization
  denial, account changes during export, and stopped polling for settled queues.
- The production build and loopback cron HTTP smoke checks pass. Cleanup and
  notifications reject unauthorized requests, complete empty runs, release job
  leases, reject HEAD, and fail closed without the scheduler secret. Build output
  uses synthetic settings and must be rebuilt with deployment configuration.
  The initial no-build-cache notice is expected in this fresh source copy.
- Actionlint passes; diff whitespace, conflict-marker, and changed-file secret
  pattern checks pass. These pattern checks do not constitute a complete secret
  scanning service or a proof that no undiscovered vulnerability exists.

An initial full run exposed the old exact-index assertion described above. A
focused rerun confirmed the planner uses another valid owner index; the final
suite checks indexed access without forcing a specific optimizer decision. One
new browser assertion initially used the wrong existing empty-state wording;
the corrected test passes.

Synthetic visual evidence: [phone queue](assets/20-staff-queue.png) and
[phone email](assets/20-status-email.png). The queue page fits the 390 px viewport;
its wide table remains horizontally scrollable. The email has no outbound asset
requests and links only to the configured portal and registrar email address.

Apply **`20261112000200_staff_queue_pagination`** before releasing batch 20,
together with any unapplied earlier migrations, including batch 18's role
recovery migration. This additive migration creates two indexes and does not
backfill or rewrite requests. Ordinary index creation can block writes on a large
table; plan the release window and use the existing operator migration procedure.
No migration was applied to an application database here.

Release checks still outstanding outside this workspace:

- Run the configured remote CI/native PostgreSQL job and enforce the required
  checks in GitHub/Vercel. Local PGlite replay does not substitute for that run.
- Verify real Clerk OAuth/OTP/MFA/session revocation, configured providers,
  deployed routes, and mail-client rendering/delivery in the intended environment.
  Synthetic browser checks and an HTML preview do not prove inbox delivery.
- Address the upstream ESLint lifecycle limitation when compatible peers exist.

All 20 planned local remediation batches are implemented and batch 20's local
acceptance checks pass;
the original audit's full release closure remains conditional on these explicit
operational/upstream items. No deployment or live-provider acceptance is claimed.

## Files changed in batch 20

- Queue: `src/lib/admin-queue-model.ts`, `admin-queue-query.ts`,
  `admin-queue-data.ts`, `admin-queue-fetcher.ts`,
  `src/app/api/admin/requests/route.ts`, `src/app/api/admin/requests/export/route.ts`,
  `src/app/(admin)/admin/admin-queue-client.tsx`, `use-queue-update.ts`.
- Schema/replay: `prisma/schema.prisma`, the new queue index migration,
  `scripts/test-migrations.mjs`, `vitest.setup.ts`.
- Coverage: queue model/data/API tests, student request data plan test,
  `scripts/admin-queue-fixture/model.ts`, `scripts/navigation-checks/admin-queue.pw.ts`.
- Email/dependencies/cleanup: template and its tests, `package.json`,
  `package-lock.json`, and the three deleted UI wrappers listed above.
- Documentation: README, follow-ups in reports 5/13/19, this report, and synthetic
  email/queue screenshots under `docs/remediation/assets/20-*`.

Preservation review compares all 77 files already dirty/untracked at batch 20's
start with a hash snapshot. No original file is missing. Overlaps are limited to
the intended package manifests, schema/replay setup, queue API/data tests/loader,
and documentation follow-ups; batch 18's auth, role, session, and request-form
implementations remain preserved. Batches 18-20 are uncommitted.

The renderer choice follows the publisher's
[render utility documentation](https://react.email/docs/utilities/render) and
[package migration changelog](https://github.com/resend/react-email/blob/canary/packages/react-email/CHANGELOG.md).
Clerk query behavior was checked against its
[backend user-list reference](https://clerk.com/docs/reference/backend/user/get-user-list).
Version-matched Next Route Handler guidance was read from the installed
`node_modules/next/dist/docs/`. React and Postgres review guidance informed the
effect cleanup, bounded serialization, query binding, and short transactions.
