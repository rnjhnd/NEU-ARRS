# Navigation follow-up: use the page's server authorization

Implemented locally on top of `d08bfade626683460d2ac51bf80347a54688d943`.
This follow-up removes the additional client session request on ordinary
navigation within the same account and portal. It retains the previously
implemented persistent layouts and content-only loading states.
No provider, database schema, dependency, environment or deployment settings
were changed. This report records implementation and local validation;
commit and deployment evidence are recorded separately during release.

## Behavior

- All ten private page entrypoints use `withVerifiedPage`. It verifies the
  account and allowed role before invoking the page renderer, then passes the
  account, role and Clerk session identifier to `SessionPage` with its content.
- `requirePageAccess` and the existing `getVerifiedActor` use React request-only
  memoization. Existing page and data-layer checks remain in place. There is no
  cross-request authorization cache or fallback to a role from a client token.
- The client session monitor is keyed by session, account and portal rather
  than pathname. A matching server-rendered page can display immediately without
  a navigation-triggered `/api/session` request.
- Initial entry, account changes, portal changes and return from a public page
  still require a client session check. The monitor also checks every 30 seconds,
  on window focus and when connectivity returns. Rejected or unavailable checks
  hide protected content without forcing a sign-out.
- A cached page for another session or role stays hidden. It requests a fresh
  server render and session recheck, with a 15-second recovery deadline and an
  explicit retry. Page props never establish or replace the verified actor.
- Persistent profile and staff navigation controls derive their role from the
  verified monitor when the account matches, so stale layout props cannot retain
  admin controls after a detected role downgrade.
- Next.js `loading.tsx` boundaries occupy only the page slot in the student,
  staff and receipt routes. Existing page-specific Suspense fallbacks remain.
  The settings-to-notifications link now uses Next.js `Link` for client routing
  and the framework's normal prefetch behavior.

## Files and extension rule

| Area | Files |
| --- | --- |
| Server boundary | `src/lib/page-access.ts`, `src/lib/page-access-model.ts`, `src/components/verified-page.tsx` |
| Client monitoring and identity | `src/components/session-guard.tsx`, `src/components/verified-access.tsx`, `src/components/use-profile-identity.ts` |
| Page integration | All ten private `page.tsx` entrypoints under dashboard, admin and receipt; their three layouts; three new `loading.tsx` files |
| Verification | `page-access.test.tsx`; the three affected server-render test fixtures; `scripts/authentication-fixture/entry.tsx`; `scripts/navigation-checks/authentication.pw.ts` |

New private pages should use the same server boundary and declare their allowed
roles. Their data access and mutations must retain their own server authorization;
the client boundary is a display guard, not an authorization authority.

## Verification

- `npm run check`: TypeScript and ESLint passed; **952 tests across 46 files**
  passed, including the new server boundary checks and the existing money,
  ownership, role and request-configuration regressions.
- `npm run test:navigation -- --output test-results/navigation-server-access-verified`:
  the complete Chrome suite passed **147 checks**. The earlier focused
  authentication/navigation run also passed all **42 checks**.
- `npm run build:check -- --smoke-cron`: production compilation and isolated
  loopback HTTP checks passed, using an owned disposable database and synthetic
  provider configuration. Unauthorized/missing-secret cron cases and signed
  foreign payment-event isolation remained correct.
- `git diff --check` passed. No schema or dependency changes required new
  migration or dependency-audit work.

The browser fixture uses actual application client components with synthetic
Clerk and routing adapters. It models server page results through a loopback-only
fixture endpoint; no such endpoint was added to the application. Browser checks
cover request counts for all three roles, retained shell state, session/account
mismatches, cached administrator content after a role downgrade, server-denied
finance access, recovery, periodic checks, focus/online checks and sign-out.

The role-downgrade test waits for network revalidation before advancing its
virtual recovery clock, so an in-flight request is not artificially timed out.
Phone screenshots of pending student and staff content were visually inspected.

## Limits

This removes one redundant navigation wait; it does not guarantee instantaneous
page loads. Server authorization, database/provider latency and page-specific
data loading still take time. Native prefetching remains subject to Next.js's
dynamic-route and loading-boundary behavior.

Background changes to a role or session are detected on the next monitor check,
not instantaneously. Server APIs, actions and fresh page renders continue to
verify authorization independently. Automated component fixtures do not prove
real hosted Next.js navigation or production latency; those require staged
verification before a later release. The disposable build output is for local
verification only and must not be deployed.
