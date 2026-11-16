# Navigation follow-up: remove stacked loading states

Implemented locally after release `808cdc0`. These changes are not committed or
deployed. No database, provider configuration, dependency or deployment settings
were changed.

## Cause and resulting behavior

The previous release removed a pathname-triggered session request but retained
three separate boundaries: a full workspace gate, a generic `loading.tsx` route
fallback, and each page's data Suspense fallback. It also let SWR immediately
refetch four datasets already supplied by the server. Removing one request did
not remove the sequence of loading screens.

- Removed the three generic route-level `loading.tsx` files. While a destination
  is being prepared, Next keeps the current page and layout interactive. The
  clicked staff link or new-request button gives delayed inline feedback through
  `useLinkStatus`. Once the destination renders, its existing data skeleton is
  the only normal content fallback. There is no fixed minimum loading duration.
- `RootLayout` obtains the current request's verified account/session/role binding.
  The initial document can display its authorized content before Clerk's browser
  SDK finishes loading. The branded workspace interstitial was removed.
- Password/device verification, completed signup and SSO perform a fresh document
  handoff after successful Clerk finalization. The auth view remains until that
  document arrives, and `/` resolves the correct role's portal on the server.
  Logout goes straight to `/sign-in`, including the immediate signed-out view.
- Student history, staff queue and both money reports use matching initial
  server data without a duplicate mount fetch. Query changes, explicit refresh,
  focus, reconnect and the existing polling policies still fetch as appropriate.
  Missing initial data continues to use the normal recovery fetch.
- An opaque server render ID scopes SWR cache entries to their page snapshot.
  A fresh render cannot inherit older same-account cached data. Cached router
  entries retain their own confirmed updates. Actor and role remain independent
  cache-key fields; the render ID is not sent to API endpoints or used to grant
  access. Configuration and directory resources use the same snapshot scope.
- Confirmed student cancellations first update the displayed snapshot through
  bound `mutate`, then patch other cached sorts/pages. SWR `fallbackData` need
  not exist in its shared cache; a failed refresh must not erase a saved result.

## Authorization boundaries

The initial bootstrap comes only from the server's existing backend session,
user and managed-role verification. It is consumed on the document's initial
route and cannot be reused on a later private visit after public navigation.
Once Clerk resolves, its current account/session binding takes precedence;
signed-out and mismatched sessions cannot retain the old private tree.

The background session monitor runs immediately and every 30 seconds, on focus
and on connectivity recovery. It also runs while the browser SDK is delayed,
because the server-authorized document is already visible then. Rejected or
unavailable checks hide private content. Cached page/session/role mismatches
retain bounded revalidation and explicit retry. An exceptional access recovery
may still show an account-check status; ordinary route changes do not use it.

The existing independent page, API, action, ownership, monetary and version
checks remain. A page's serialized data never establishes the verified actor.
No JWT-role fallback or cross-request authorization cache was added.

## Files

| Area | Locations |
| --- | --- |
| Initial authorization/rendering | `src/app/layout.tsx`, `src/lib/page-access.ts`, `src/components/session-guard.tsx`, `verified-page.tsx`, `verified-access.tsx` |
| Normal navigation feedback | New `src/components/navigation-pending.tsx`, staff nav links, student new-request button; removed student/admin/receipt `loading.tsx` |
| Identity handoffs | Sign-in/sign-up pages, `src/components/profile-menu.tsx`, SSO callback and new `sso-session-handoff.tsx`; removed branded loader from `workspace-loading.tsx` |
| Server snapshots | Staff queue, student history, finance/movement clients and typed fetchers; configuration resource hook and student directory |
| Hydration | Request form, queue, configuration and directory can use the server-verified actor while the SDK loads, and retain mismatch checks once it resolves |
| Verification | Updated auth/navigation/data fixtures, four no-duplicate-read checks, snapshot/cancellation regressions, initial-page-access tests; new `scripts/next-transition-fixture` and `next-transitions.pw.ts` |

## Verification

- TypeScript, ESLint and **956 tests across 46 files** passed.
- **164 Chrome browser checks** passed, including the four real Next.js
  transition checks and session-revocation checks with a delayed browser SDK.
- The application's production Turbopack build and isolated HTTP smoke checks
  passed with a disposable owned database and synthetic provider keys. The
  generated `.next` directory is verification-only and must not be deployed.
- `git diff --check` passed. No schema or dependency changes required migration
  or dependency-audit changes.

The new framework fixture builds and serves a real production Next.js app on
loopback using the actual guard, sign-in, SSO handoff, profile menu and pending-link
components. It uses Webpack solely to alias Clerk to a synthetic adapter; the
application's own Turbopack build is verified separately. Test auth and data are
synthetic. Application environment files and live credentials are excluded.
The fixture is copied and built under ignored `scratch`, and its owned server
is stopped after testing.

The four real Next checks exercise route preparation, one streamed data fallback,
password sign-in, direct logout and the SSO document handoff. A mutation observer
retains only loading-marker names across document redirects, so a transient
workspace/page/account interstitial cannot disappear before the final assertion.
Pending-link feedback and retained sidebar state are checked while the server is
deliberately slow. The captured content-fallback screenshot was inspected.

These tests do not measure hosted latency or prove a real Google/Clerk provider
exchange. Before release, verify the real staged login, logout and navigation
flows. One genuine data skeleton or provider-authentication status can still be
necessary; the app does not promise zero network latency or hide access failures.
