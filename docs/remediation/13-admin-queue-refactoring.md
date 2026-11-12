# Batch 13: Admin request queue state and component refactoring

Implemented locally on 2026-11-11, following
[batch 12](12-student-history-pagination.md). This batch covers the staff queue,
its read API, status-update feedback, and the existing payment review controls.
It does not change permitted workflow transitions, refund policy, notification
delivery, roles, monetary storage, migrations, dependencies, or deployment state.

## 1. Codebase architecture and design

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | `src/app/(admin)/admin/admin-queue-client.tsx`, `queue-table.tsx`, `queue-update-dialog.tsx`, `use-queue-update.ts` | The large queue component combined fetching, filters, sorting, selection, table markup, three dialog flows, CSV generation, and mutations. The workspace now owns the verified queue and selection; a stable table renders rows, keyed dialogs retain request-specific drafts/snapshots, and one hook handles status-update submission/recovery. |
| Medium | `src/lib/admin-queue-data.ts`, `admin-queue-model.ts`, `src/app/(admin)/admin/admin-queue-data.tsx`, `src/app/api/admin/requests/route.ts` | Initial rendering and polling duplicated label/profile loading and returned inconsistent names. Both now use one authenticated loader with an explicit display-field projection, stored request names/numbers, configured/legacy labels, primary emails, and ISO dates. Full Clerk resources and database records are not serialized to the browser. |

The API uses `/api/admin/requests?format=queue-v1` and returns an envelope with
`actorId`, staff `role`, `emailLookupFailed`, and `items`. The initial server render
uses the same shape. Each row contains only the fields displayed, searched,
exported, or required for a versioned workflow submission. Student ownership IDs,
provider references, submission keys, monetary internals, and notification
metadata are excluded.

Names consistently represent the stored request identity. Previously the initial
render replaced them with names from the first directory page, while refreshes
used stored names. Primary email lookup is supplementary: a missing account or
missing primary address produces an unavailable email, without inventing an
address from another account/address slot.

## 2. Code quality and refactoring

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | `queue-table.tsx`, `admin-queue-model.ts`, `admin-queue-client.tsx` | Nested sortable headers remounted during interaction, and broad persistence-model sort keys obscured the actual UI contract. Headers now have stable module identities, five typed fields, and `aria-sort`; date sorting uses timestamps and equal values use an ID tie-breaker. Filtering/sorting/page changes reset pagination and selection in their event handlers. A derived page clamp handles shrinking feeds without a reset effect. |
| Medium | `admin-queue-client.tsx`, `queue-update-dialog.tsx` | Selections persisted across pages and filters, and selected/live rows could silently acquire new versions. Selection now records the version seen when checked, is confined to the current view, and is cleared on navigation/search/filter/sort changes. Changed or missing selected rows disable bulk updates until explicitly reselected. Open dialogs retain their original versions and disable submission if any snapshot changed. |
| Medium | `queue-table.tsx`, `queue-update-dialog.tsx` | Mouse-only row opening and unnamed checkboxes lacked usable control names. Rows now expose named details buttons and labelled selection checkboxes; dialog inputs are labelled, forms submit normally, and status changes use a native select. Details include the stored student number and cancellation reason. Modal content scrolls inside the phone viewport; pending actions block dismissal. |

The existing normal workflow, paid-online eligibility, explicit cash collection,
administrator override reasons, optional reversal correction email, receipt
link, and cancelled-payment review remain available. The shared
`request-workflow.ts` policy still drives eligible controls; server guards remain
the authority for every mutation.

## 3. Security vulnerabilities

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `admin-queue-client.tsx`, `admin-queue-fetcher.ts` | A shared unscoped SWR key and unchecked responses could retain staff-visible student data across identity/role changes. Cache keys now include staff ID and role. The fetcher validates the envelope, dates, statuses, unique IDs, and matching actor/role. Resolved Clerk account/role changes, API 401/403, wrong-owner/role envelopes, and followed login redirects hide the queue. |
| High | `admin-queue-model.ts` (`queueCSV`), `admin-queue-client.tsx` | CSV cells were interpolated without escaping quotes or guarding spreadsheet formulas. Every cell is now quoted, embedded quotes are doubled, and formula/control prefixes receive an apostrophe. Multiline values remain inside quoted cells; unavailable fields do not become `undefined`. Export explicitly covers the full verified queue, and download object URLs are released. |
| Medium | `admin-queue-data.ts`, `src/app/api/admin/requests/route.ts` | Read failures and authorization failures were conflated as 500, and full request rows exposed unnecessary internals. Authentication/employee-or-admin authorization now precede database/directory access. The API returns distinct 401/403/500 responses with `Cache-Control: private, no-store`; unexpected logs include the error class only. The loader's explicit selection and serializer enforce the reduced DTO. |

Client role checks hide stale controls and data; they do not grant or revoke
permissions. Server status actions still use `requireEmployeeOrAdmin`, with
`requireAdmin` for overrides. Payment review still calls its administrator-only
server action. No policy is replaced with a client-provided role or checkbox.

## 4. Dead code and unused files

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Low | `admin-queue-client.tsx`, `admin-queue-data.tsx`, API route | Removed the full-record `MappedRequest` client type, unchecked fetcher, duplicated loader/label maps, inline header definition, pagination-reset effect, scattered dialog state, unused icons/imports, and queue-specific animation wrappers. The shared legacy label registry and workflow policy remain in use. |

No shared UI primitive, dependency, or unrelated asset was deleted. The new
fixture and regression files are intentional development-only coverage.

## 5. Performance and reliability weaknesses

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `use-queue-update.ts`, `queue-update-dialog.tsx`, `src/app/actions/admin.actions.ts` | An action rejection/throw could strand pending controls; cancellation dialogs cleared drafts before success; cache changes invented partial state. All status paths now share immediate duplicate guards and guaranteed pending cleanup. The server returns minimal committed status/payment/version changes. Confirmed success/warnings are handled separately from cache refresh, so a read failure retains the saved status and blocks further updates until a verified read. Failed dialog submissions preserve their drafts. No automatic mutation/refund retry is introduced. |
| Medium | `admin-queue-data.ts` | Unfiltered `getUserList()` read the default directory page and missed represented students beyond it. The loader deduplicates represented IDs, looks up batches of at most 100 IDs with an explicit limit, and runs at most three lookups concurrently. It selects the primary address by ID and ignores unrelated accounts. A directory failure produces an explicit email-availability warning while stored identity/workflow data remains usable. |
| Medium | `admin-queue-client.tsx`, `admin-queue-fetcher.ts` | Five-second unchecked refreshes could replace rows with error JSON or fail silently. Refreshes now validate data, use a ten-second fetch timeout, retain verified rows on transient failures, disable mutations/export until recovery, and offer manual refresh. Polling runs every 30 seconds while visible/online, with focus/reconnect refresh and bounded retries. Unlike student history, even a settled staff queue continues polling for newly submitted requests. |
| Medium | `cancelled-payment-review.tsx`, `queue-update-dialog.tsx`, `use-queue-update.ts` | Payment review had separate pending state that did not protect parent dismissal. Review progress now locks the dialog and queue, with an immediate duplicate guard, preserved failure draft, and guarded late callbacks. Status/review pending flags also clear if authorization is lost mid-flight, so same-session recovery cannot leave the queue stuck. Account switches suppress late action notifications. |

### Remaining performance limit

The staff loader still reads the complete projected request set, and browser
filtering/sorting/pagination and full CSV generation still operate on that set.
The total number of email batches therefore grows with represented students.
This batch improves correctness, per-row payload size, lookup concurrency, and
polling frequency; it does not claim bounded total queue work or constant-time
server queries. Cross-student server filtering/pagination and a separate full
export path remain a performance follow-up for the final data-access review.
The student-owned pagination API from batch 12 is unchanged.

Counts and rows reflect the last verified feed plus confirmed mutations, not a
cross-system snapshot of Postgres and Clerk. Email availability does not decide
payment/workflow eligibility. Committed versions returned by the status action
describe the status transaction; a subsequent refund may update payment/version
again. Further mutation controls stay blocked until the post-action read, and
newer cached versions take precedence over older action results.

## Verification and acceptance

- **501 Vitest tests passed across 21 files.** Thirty new model/fetch/route tests
  cover DTO projection, identity consistency, auth-before-data, both staff roles,
  primary email selection, unavailable/missing accounts, 205 represented users,
  private responses, format retirement, failed/malformed reads, sorting/clamping,
  stale snapshots, committed-version merging, and CSV escaping/formula prefixes.
  An additional status-action test checks the minimal committed response; all
  existing authorization, payment, concurrency, refund, and notification tests
  continue to pass.
- **45 isolated Chrome checks passed:** sixteen staff queue checks, the existing
  nine navigation checks, and twenty student history checks. Staff coverage
  includes focus, selection isolation, clamping, malformed/error refreshes,
  thrown actions and duplicate guards, preserved cancellation drafts, committed
  cancellation with a failed read, cash confirmation and submitted versions,
  polling conflicts, reasoned/correction-opt-in overrides, employee restrictions,
  payment-review failure/retry/dismissal guards, identity/role/session changes,
  late results, authorization-loss recovery, CSV download, and phone layout.
- TypeScript and focused ESLint passed. Full repository lint is now **30 errors /
  21 warnings**, down from **36 / 23**. Existing finance, settings, student
  management, and auth-feature issues still prevent fully green lint-gated CI.
- Production build and loopback cron HTTP checks passed with an owned disposable
  database and synthetic provider keys. The generated `.next` output is for
  verification only; rebuild with intended configuration before deployment.
- The phone details screenshot was reviewed; the dialog fits the 390-by-844
  viewport and its body/footer are internally scrollable. See the
  [reviewed phone screenshot](assets/13-admin-queue-details.png).
- No schema/dependency changes were made, so migration replay and dependency
  audits were not repeated. The full unit suite still exercises the existing
  disposable-database history checks. Diff whitespace/conflict checks passed.

Browser fixtures use the real React components, workflow policy, SWR, validators,
CSS, and Base UI dialog with synthetic auth/API/action responses. They exclude
application environment files, block service workers/other-origin page requests,
assert no page errors, and close their owned server/browser. Server tests mock
Clerk/Prisma and financial providers. Full authenticated deployment integration,
native database concurrency, real Clerk directory behavior, payment/refund/email
operations, and production-scale measurements remain release checks. None was
performed against a real account or application database in this batch.

The local acceptance criteria for this focused refactoring batch are met. The
next planned batch is **batch 14: finance dashboard correctness and performance**.

Follow-up: [batch 14](14-finance-reporting.md) implements the focused finance
work and extends the browser suite to 58 checks. The figures above remain this
batch's original verification baseline.

## Rollout and changed files

Ship the queue API, dashboard, and status-action response together. Unversioned
queue API calls receive a private 409 asking for a reload, after authorization
and without loading request data. Previously open staff tabs must perform a full
browser reload. No migration or new environment variable is required here.

| Area | Files |
| --- | --- |
| Queue UI | `src/app/(admin)/admin/admin-queue-client.tsx`, `admin-queue-data.tsx`, `queue-table.tsx`, `queue-update-dialog.tsx`, `use-queue-update.ts`, `cancelled-payment-review.tsx` |
| Read model/data | `src/lib/admin-queue-model.ts`, `admin-queue-data.ts`, `admin-queue-fetcher.ts`, `src/app/api/admin/requests/route.ts` |
| Status action | `src/app/actions/admin.actions.ts`, `src/app/actions/__tests__/admin.actions.test.ts` |
| Read/model tests | `src/lib/__tests__/admin-queue.test.ts`, `src/app/api/admin/requests/__tests__/route.test.ts` |
| Browser tests | `scripts/navigation-fixture/server.mjs`, `scripts/navigation-checks/admin-queue.pw.ts`, `scripts/admin-queue-fixture/index.html`, `entry.tsx`, `actions.ts` |
| Documentation | `README.md`, `docs/remediation/12-student-history-pagination.md`, this report, `assets/13-admin-queue-details.png` |

Earlier remediation work remains preserved. No commit, push, merge, deployment,
live provider/database change, or destructive Git operation was performed.

The Clerk lookup limits and parameters were checked against the installed SDK
and [Clerk's primary documentation](https://clerk.com/docs/reference/backend/user/get-user-list).
The primary-address choice also follows the
[backend User contract](https://clerk.com/docs/reference/backend/types/backend-user).
Version-matched Next.js route/testing guides were read from
`node_modules/next/dist/docs/`; the React review covered stable components, hooks,
typed props, accessible controls, and asynchronous cleanup.

Follow-up: [batch 20](20-final-cleanup-performance.md) replaces the full-feed
read with ten-row server pages and exact global summaries, adds a separate
size-limited CSV endpoint, and introduces the staff queue index migration. The
figures and performance limits above describe this batch's historical baseline.
