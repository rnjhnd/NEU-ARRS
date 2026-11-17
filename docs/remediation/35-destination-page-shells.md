# Destination banners and one continuous data-loading state

Implemented locally after release `59d056f`. Not committed or deployed. No
provider settings, environment values, database schema or dependencies changed.

## Problem and behavior

Removing the generic route loader left the previous page visible while server
authorization prepared the destination. The destination's banner and its data
skeleton appeared only afterwards. An inline sidebar spinner accurately showed
navigation activity, but the sequence still felt like two loading phases.

Each of the nine student/staff pages now owns a `page-shell.tsx` and a matching
`loading.tsx`. Next can partially prefetch the lightweight destination shell.
The shell displays the real static title, description, banner and appropriate
data placeholders while page authorization and data reads complete. The loaded
page uses the same shell and skeleton components, so it does not switch from a
generic loading screen to a different page skeleton. Persistent layouts retain
the sidebar, collapse state, profile controls and student header.

The standard gradient banner presentation is shared in
`src/components/workspace-banner.tsx`. New Request, Money Movements and
Notification recovery retain their distinct header designs. Existing queue,
directory, configuration and finance skeleton shapes were moved without
inventing counts or data. Money Movements and Notification recovery now also
have their own data placeholders.

The request catalog/payment settings and notification query run inside nested
Suspense boundaries instead of blocking their static headers. The new request
data component has moved to `dashboard/new/request-data.tsx`; the existing
maintenance, malformed-setting, empty-catalog and authorization tests continue
to exercise it. Independent dashboard user/settings reads run in parallel after
student authorization.

## Authorization and data freshness

Loading shells contain public presentation only. They do not read the database,
Clerk user/session, prices, request IDs, notifications, money totals or role
assignments. The student greeting uses a name placeholder and the New Request
button stays disabled until the verified user and maintenance setting arrive.

`withVerifiedPage`, `SessionPage`, initial document binding, background session
monitoring, server role/ownership checks, API checks and action checks remain in
place. A prefetched loading shell never grants access. A forbidden destination
may briefly show static page labels, but no private result or actionable form.

The snapshot-scoped SWR keys and no-duplicate-initial-fetch behavior from the
previous change are unchanged. This work introduces no permission cache or
cross-account data cache and no forced full dataset refetch on mount.

Inline link feedback remains available when a destination fallback has not yet
been prefetched or its route code/network response is still pending. There is
no artificial wait, minimum spinner duration or promise of zero network latency.
Fresh-document layout authorization still runs before private workspace chrome.

## Verification

The real production Next fixture uses the actual nine page shells, actual staff
navigation, session guard, authentication handoff and profile menu, with fake
loopback-only accounts/data. Authorization and data are delayed independently.
It checks destination headers before authorization finishes, one matching data
region, unchanged banner geometry, sidebar persistence, forbidden employee
access, non-personalized/disabled dashboard placeholders, rapid navigation,
back/forward history and login/logout. Existing marker checks reject transient
generic page/workspace/account loading screens during ordinary navigation.

The fixture's CSS explicitly scans the production `src` components; captured
student and staff fallback screenshots were inspected. Its shared layout and
records are synthetic, so these captures are not hosted production screenshots.

- TypeScript, ESLint and **969 tests across 47 files** passed.
- **173 Chrome checks** passed, including 13 real Next.js transition/auth checks.
- The main production Turbopack build and isolated HTTP smoke checks passed.
  The generated `.next` directory is verification-only and must not be deployed.
- `git diff --check` passed. No dependency/schema changes required new migration
  or dependency-audit work.

No live services or business records were accessed. Hosted timing and
real-provider navigation remain release checks; browser automation is currently
unavailable. This implementation has not been committed, pushed or deployed.
