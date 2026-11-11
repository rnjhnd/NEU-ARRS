# Batch 11: Student request history state and recovery

Implemented and verified locally on 2026-11-11. This focused batch follows
[batch 10](10-navigation-state.md). It covers the student history display,
refresh boundary, cancellation dialog, and payment setup controls. There are no
new dependencies, schema migrations, live database changes, provider operations,
or deployments in this batch. Notification recovery retains the previously
chosen daily fallback.

## 1. Codebase architecture and design

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | `src/app/(student)/dashboard/request-list.tsx`, `request-history-table.tsx`, `cancel-request-dialog.tsx`, `request-summary.tsx` | One component combined fetching, sorting, pagination, workflow notifications, table markup, payment setup, and cancellation. Extracted the table, summary, and dialog; the parent owns the verified history and interaction selection. The dialog owns its request-specific draft and submission state. |
| Medium | `src/app/(student)/dashboard/dashboard-data.tsx`, `src/app/api/student/requests/route.ts`, `src/lib/student-request-data.ts`, `src/lib/student-request-model.ts` | Initial rendering and polling duplicated database loading and document-label mapping, and passed full persistence records to the client. Both now use one loader with an explicit display-field projection and ISO date serialization. The dashboard's summary derives from the same live history as its rows. |

The new client requests `/api/student/requests?format=history-v1`, which returns
`{ studentId, items }`. The unversioned route keeps an array response for older
open tabs; it uses the same reduced display projection. No provider references,
student names/numbers, submission keys, prices, or notification metadata are
included in either response. The route authenticates before loading data and
always derives ownership from Clerk, regardless of query parameters. Success
and error responses use `Cache-Control: private, no-store`.

## 2. Code quality and refactoring

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | `request-list.tsx`, `request-history-table.tsx` | Inline sortable-header components were recreated on every render, causing React lint failures and lost keyboard focus. Headers now have stable module-level identities, typed sort keys, and `aria-sort`. Row expansion has a named keyboard-accessible button and a linked details row. |
| Medium | `src/lib/student-request-model.ts`, `request-list.tsx` | Pagination could point beyond a shrinking history, and sorting retained an unrelated page. A pure, immutable view helper clamps the displayed page, sorts dates chronologically with deterministic ID ties, and returns ten rows. Changing the sort resets to page one; sort/page actions clear expansion. |
| Low | `request-summary.tsx`, `request-list.tsx` | Static counts diverged from polled workflow changes, and `Total Processed` counted every request. Counts now derive from live rows and the label is `Total Requests`. Status-change detection uses a map instead of repeated linear searches and ignores older versions when updating its notification baseline. |

## 3. Security vulnerabilities

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `request-list.tsx`, `src/lib/student-request-fetcher.ts` | A global history cache key and unguarded fallback could retain the previous account's personal request history after an account switch. The SWR key includes the owner ID; the fetched envelope must match it. A resolved different/signed-out Clerk identity, HTTP 401/403, or a followed login redirect hides cached history. Account-scoped child state unmounts on identity changes. These client guards supplement existing server authorization. |
| Medium | `src/app/api/student/requests/route.ts`, `src/lib/student-request-model.ts` | Spreading complete database records unnecessarily exposed internal fields to browsers. Explicit selection and serialization limit the response to fields the history actually displays. Error logging records the error class without dumping request/database details. |
| Medium | `request-list.tsx` | Payment setup could redirect after the history component was invalidated by an account switch or refresh failure. A lifecycle guard suppresses late response effects; destination parsing requires HTTPS. Immediate in-flight guards prevent duplicate activation and pending controls always recover. Provider destination validation in the existing server payment flow remains in place. |

Successful JSON is validated with Zod before it enters the cache. Malformed
shapes, statuses, dates, HTTP failures, HTML, owner mismatches, and redirected
responses cannot become an apparently valid empty history. Fetches use
`no-store` and a ten-second timeout. Fixed user-facing errors avoid displaying
raw API response bodies.

## 4. Dead code and unused files

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Low | `request-list.tsx`, `dashboard-data.tsx` | Removed the duplicated legacy label maps, unchecked local fetcher, nested header definition, full-record `as any` cast, redundant row-animation wrappers, unused imports, and copied cancellation state. Shared helpers and focused components replace these paths. |

No orphaned file or asset deletion was needed for this batch. The full repository
has not been declared free of dead code. The new browser fixtures are intentional
development-only regression coverage, separate from the application routes and
Vitest discovery.

## 5. Performance and reliability weaknesses

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `cancel-request-dialog.tsx`, `request-list.tsx` | A cancellation could commit while a subsequent refresh failed, making the action appear unsuccessful and inviting retries. Action success is now reported independently of cache refresh. The authoritative result merges into the cache without overwriting a newer version; a read failure retains that cancellation and exposes refresh failure. No automatic cancellation/refund retry is introduced. |
| Medium | `cancel-request-dialog.tsx` | Submission failures lost context and pending actions could be activated repeatedly or dismissed. Transport/action failures preserve the reason; pending confirmation, dismissal, and Back are guarded. Selecting another request creates a new draft. Live workflow changes disable an obsolete confirmation. The existing server action still validates ownership, status, and the final reason. |
| Medium | `request-list.tsx`, `src/lib/student-request-fetcher.ts` | Unchecked polling could replace valid rows with an error body or fail silently. Transient failures now keep the last verified rows, show an alert and manual refresh control, and disable changes until refresh succeeds. Authorization failures hide rows. Retries are bounded and authorization failures do not use the automatic retry path. |
| Medium, deferred | `src/lib/student-request-data.ts`, `request-list.tsx` | History still loads every request belonging to the student and polls the feed at the existing five-second interval. Rendering ten rows is client pagination; it does not bound database work or response size. The next recommended batch is server-side pagination with stable ordering, whole-history summary counts, and a deliberate polling/invalidation strategy. |

## Verification and acceptance

The verified story is: load an authenticated student's projected history,
validate refresh responses, render and sort its pages, submit a cancellation or
request payment setup, and recover without losing confirmed state or showing
another account's history.

- **446 Vitest tests passed across 18 files**, including 18 new display-contract,
  fetch-boundary, and authenticated route tests. The route tests exercise the
  real loader against mocked Prisma, including a forged owner query and the
  legacy array contract.
- **22 Playwright checks passed** using an isolated installed Chrome profile:
  nine existing navigation checks and thirteen student-history checks. These
  cover focus retention, sort/page reset and clamping, malformed/failed refresh
  recovery, cancellation transport/action failures, pending duplicate/dismissal
  guards, committed cancellation with a failed read, workflow polling changes,
  unsafe payment URLs, account/session changes, late payment responses, draft
  isolation, and pending controls recovering after a refresh error.
- The phone cancellation screenshot was regenerated with animations disabled
  and visually inspected; its targeted browser test also passed. The dialog and
  its controls fit the 390-by-844 viewport. See
  [the reviewed screenshot](assets/11-student-cancellation.png).
- `npx tsc --noEmit` and focused ESLint passed. Full repository lint remains
  **36 errors / 23 warnings**, improved from batch 10's **43 / 26**. The remaining
  failures are in other admin/student/auth feature files; full lint and the
  lint-gated CI test job are not green.
- `npm run build:check -- --smoke-cron` passed: production compilation, type
  generation, disposable-database page generation, and loopback cron HTTP
  authorization/empty-run/lease-release checks. The generated `.next` artifact
  contains synthetic verification settings; rebuild with intended configuration
  before deployment.
- No schema or dependency files changed for this batch, so migration replay and
  dependency audits were not repeated. No conflict markers or whitespace errors
  were found in the final diff check.

Browser fixtures use the actual React components, CSS, Base UI primitives, SWR,
and response validation. Clerk, routing, action responses, and API data are
synthetic. Their owned loopback server excludes application environment files,
blocks service workers and other-origin page requests, and checks for browser
errors. This confirms component behavior; authenticated production browser-to-
database/payment integration and remote browser CI remain unverified. No real
account, application database, payment, refund, or email was used.

The local acceptance criteria for this focused state-handling batch are met.
This does not mark the entire audit or the deferred pagination work complete.

Follow-up: [batch 12](12-student-history-pagination.md) implements server-side
pagination and revised polling. Its `history-v2` rollout supersedes the legacy
API compatibility and full-history behavior described here. The figures in this
report remain the original batch 11 verification baseline.

## Resume review and file manifest

Before the usage-limit interruption, the core components, display model, loader,
fetcher, and regression fixtures were implemented. The last edit added API format
compatibility but had not updated its tests and browser mock. On resume, Git
status/diffs and the untracked files were inspected; prior batches were preserved.
The route tests now pass real Web Requests, test the legacy response, and restore
their console spy; the browser mock matches the versioned URL. Final validation,
this report, the reviewed screenshot, and README links were completed afterward.
No commit, push, merge, reset, or destructive Git operation was performed.

Files in this batch (all paths relative to the repository):

| Area | Files |
| --- | --- |
| Student components | `src/app/(student)/dashboard/dashboard-data.tsx`, `request-list.tsx`, `request-history-table.tsx`, `cancel-request-dialog.tsx`, `request-summary.tsx` |
| Shared tracker | `src/components/request-tracker.tsx` |
| Data boundary | `src/lib/student-request-model.ts`, `student-request-data.ts`, `student-request-fetcher.ts`, `src/app/api/student/requests/route.ts` |
| Unit tests | `src/lib/__tests__/student-request-model.test.ts`, `src/app/api/student/requests/__tests__/route.test.ts`, `vitest.setup.ts` |
| Browser tests | `scripts/navigation-checks/request-list.pw.ts`, `navigation.pw.ts`, `scripts/navigation-fixture/server.mjs` |
| Browser fixture | `scripts/request-list-fixture/index.html`, `entry.tsx`, `request-actions.ts` |
| Documentation | `README.md`, `docs/remediation/10-navigation-state.md`, `11-student-request-state.md`, `assets/11-student-cancellation.png` |

Version-matched Next.js route-handler and router guides were read from
`node_modules/next/dist/docs/` before editing. The React review covered stable
component identity, typed props, effect cleanup, accessible controls, and derived
state. Server-side pagination remains explicitly deferred as described above.
