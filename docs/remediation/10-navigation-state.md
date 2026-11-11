# Batch 10: Shared navigation state and component structure

Implemented locally. This batch addresses shared navigation, profile display,
and the theme control. Request-list, finance, settings, and other feature
components remain separate batches. No database, provider account, cron schedule,
or production deployment changes were made. The approved verification follow-up
adds development-only browser test tooling.

## Findings addressed

| Priority | Location | Finding and remediation |
| --- | --- | --- |
| Medium | `src/components/profile-menu.tsx`, `src/app/(admin)/sidebar.tsx`, `src/app/(admin)/mobile-nav.tsx`, `src/lib/profile-identity.ts` | The profile menu copied Clerk resources into untyped state, while navigation mutated/read cached names through refs during rendering. A resolved sign-out could leave a previous identity visible. Profile fields now derive from the current typed Clerk identity. The identified server snapshot is used only while Clerk is unresolved; resolved sign-out clears it. A different account cannot inherit the previous account's server role, email, image, or name. |
| Medium | `src/app/(admin)/mobile-nav.tsx`, `src/app/(admin)/use-desktop-navigation.ts` | The custom portal required a mount-effect render, lacked dialog semantics and keyboard/focus handling, and only hid its open panel with CSS at desktop widths. Mobile navigation now uses the installed Base UI modal dialog, including a labelled trigger/title/close button, focus containment, Escape/outside dismissal, focus restoration, and modal scrolling behavior. Route, identity, or desktop-breakpoint changes remount closed state. |
| Medium | `src/app/(admin)/admin-nav-links.tsx`, `src/lib/admin-navigation.ts` | Desktop and mobile repeated route definitions, permission visibility, active styles, and markup. Both now share one route model and renderer. Nested paths use segment boundaries, collapsed links retain screen-reader names, and the active workspace has `aria-current`. Notification recovery highlights System Settings. |
| Low | `src/components/profile-menu.tsx` | Sign-out had no pending state or rejection feedback, while several imports and derived variables were unused. Sign-out now disables repeat activation while pending, catches errors, and displays a generic alert. Support uses a mail link. Removed the unused router, loading icon, untyped cached resource, and unused role flag. |
| Low | `src/components/profile-details.tsx`, both application layouts, sidebar | Profile labels duplicated menu identity logic and the student layout kept static name/role labels beside a live profile menu. Shared labels now use the same identity resolver. Both server DTOs include the account ID and normalize display roles. Removed the redundant `serverRole` navigation prop and unused sidebar icon. |
| Low | `src/components/theme-toggle.tsx` | The shared theme control used an effect plus a lint suppression to reveal static markup, and toggled from the literal `system` theme instead of its resolved appearance. It now renders the same CSS-controlled icons on server/client and reads `resolvedTheme` only in the click handler. The mount state, effect, placeholder, and rule suppression were removed. |

## Design and limits

`profile-identity.ts` contains a small structural profile type and pure identity
resolution; no full Clerk resource is retained or serialized. Live names, primary
emails, and images replace bootstrap values together. Removing a live field
does not resurrect an older value. The same account retains its server role
snapshot; a new account's role is normalized independently. Invalid/unsupported
roles display as student.

The server snapshot remains a loading fallback while Clerk is unresolved. It is
not an authentication decision. Server layouts/claims still need their normal
refresh to reflect same-account role changes. All route/action authorization
continues to be enforced by the existing server guards and proxy. Hiding a link
does not grant or revoke access.

The desktop breakpoint subscription uses React's `useSyncExternalStore`, with a
stable server snapshot and listener cleanup. No component copies props or auth
resources into state to synchronize their display. State is reserved for actual
interaction: sidebar collapse, mobile open state, and sign-out progress/errors.
Next.js `Link.onNavigate` closes mobile navigation on in-tab navigation; modified
clicks retain Next.js's normal behavior.

The mobile drawer uses the already-installed Base UI dialog primitives rather
than bespoke focus/scroll listeners. Its edge transition uses CSS with reduced
motion support; the desktop sidebar keeps its existing width animation. No new
runtime or test dependencies were introduced.

## Verification

- **428 unit/server-render tests passed across 16 files**, including the 29
  navigation regression tests from the original batch.
- **Nine Playwright checks passed in an isolated Chrome profile**, covering:
  keyboard focus wrapping and restoration; Escape and backdrop dismissal;
  nested profile menus; background scroll locking and recovery after resizing;
  desktop collapse and accessible link names; route-driven closure; account
  switching without stale identity/admin links; sign-out pending, failure, and
  successful retry; system-theme toggling; and phone viewport layout.
- TypeScript and focused ESLint passed. Full repository lint remains at
  **43 errors / 26 warnings**, improved from the pre-batch 54 / 30 baseline.
  Existing feature-component failures still prevent a fully green repository
  lint/CI test job. No new lint suppressions were introduced.
- The production build and loopback cron HTTP checks passed with an owned
  disposable database and synthetic provider keys. No schema changes required
  additional migration replay. Rebuild with intended configuration before
  deployment; the generated build remains verification-only.
- The complete npm audit reports **zero vulnerabilities**, and the dependency
  tree validates with `npm ls --all`.

### Repeatable browser checks

Run `npm run test:navigation` after `npm ci`, with Google Chrome installed.
The approved follow-up adds development-only `@playwright/test@1.65.0`.
`playwright.navigation.config.ts` launches headless Chrome with a fresh profile;
it does not attach to the user's signed-in browser or require the extension.

The suite owns a loopback Vite server using the actual navigation, profile,
theme, CSS, and Base UI components. Clerk and Next routing have synthetic
adapters under `scripts/navigation-fixture`. Application environment files
are excluded, service workers are blocked, and page requests to other origins
are rejected. Tests assert no page errors or unexpected outbound requests.
The fixture server and browser are closed after the run.

`scripts/navigation-checks/navigation.pw.ts` uses a separate test suffix and
an ESM package scope, so Vitest keeps its existing test discovery and the
application's module type is unchanged. Failure screenshots/traces and the
mobile screenshot are written under ignored `test-results/navigation`.

The [verified phone drawer screenshot](assets/10-navigation-mobile.png) was
inspected after the successful run. The pending component interaction checks
from batch 10 are now complete.

This is component interaction verification with mocked auth and routing.
It does not exercise a real Clerk session, Next server navigation, provider
sign-out, or an authenticated full-application deployment. Those broader release
rehearsals remain separate. Remote browser CI was not configured or run.

### Browser integration limitation

Chrome's extension connection was confirmed, but the browser automation service
still failed with an internal `timeoutMs` error, including on an empty tab after
restarting Chrome and the desktop app. The user explicitly approved Playwright
as an alternative, which completed the checks above. The integration error has
not been repaired; it is independent of the passing component tests.

Next recommended focused batch: student request-list state handling and its
remaining React/lint issues.

Follow-up: [batch 11](11-student-request-state.md) implements that focused work
and extends the shared browser suite to 22 checks. The verification figures
above record the original batch 10 baseline.

## References

- [Playwright Chrome browser channels](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge)
- [Playwright assertions](https://playwright.dev/docs/test-assertions)
- [React: deriving state without effects](https://react.dev/learn/you-might-not-need-an-effect)
- [React: browser subscriptions and server snapshots](https://react.dev/reference/react/useSyncExternalStore)
- [Clerk useUser loading/signed-out/signed-in states](https://clerk.com/docs/nextjs/reference/hooks/use-user)
- [Base UI dialog](https://base-ui.com/react/components/dialog) (implementation
  also checked against installed 1.5.0 type declarations)
- [next-themes documentation](https://github.com/pacocoursey/next-themes)
- Version-matched Next.js guides read before editing:
  `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`,
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`,
  and `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`.
