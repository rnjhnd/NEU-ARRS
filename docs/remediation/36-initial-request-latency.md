# Initial request latency

Implemented locally on top of `816e6c4`. Release and hosted timing checks remain
pending. This batch does not change the live deployment or provider settings.

Release CI subsequently detected an unpatched development-tool advisory. The
owner-approved, expiring exception and its limits are documented in
[37-controlled-demo-audit-exception.md](37-controlled-demo-audit-exception.md).
This does not claim the complete dependency audit has zero findings.

## Findings and changes

The live deployment reports `iad1` (US East). Its production `DATABASE_URL`
metadata still matches the ID, timestamp and Production-only scope saved during
the verified November 13 migration. That migration confirmed the Singapore Neon
endpoint. No connection string was decrypted, downloaded or printed to verify
this. `vercel.json` now selects the single Singapore region, `sin1`, for the next
deployment. The existing daily cron paths and schedules are unchanged. A single
region preserves Hobby compatibility. See Vercel's [region configuration
documentation](https://vercel.com/docs/functions/configuring-functions/region).

Account verification previously awaited a live Clerk session, then its user,
then the database role policy. The session is still checked first. After that,
independent user and policy reads run together; both must complete successfully
before access is granted. Signed-out, revoked, expired and mismatched sessions
still stop before profile/policy reads. Banned/locked users, blocked or mismatched
role policies, provider errors and database errors still fail closed.

`getVerifiedAccount` uses React's request-scoped cache to share the verified actor
and an allowlisted display profile within one server render. Student/staff layouts
and the dashboard reuse that profile instead of subsequently calling
`currentUser`. `getVerifiedActor` preserves its existing `{ userId, role }`
contract, so API responses and page-access proofs do not acquire profile fields.
No full Clerk object, private metadata or unrelated metadata is returned.

Clerk already documents per-request fetch deduplication; removing `currentUser`
does not establish that every former call caused another network request. The
concrete improvements are concurrent independent verification reads, one shared
verified profile, and eliminating a duplicate dashboard setting query.

The dashboard passes its already-read maintenance result to its server history
component. An unavailable/malformed setting still disables new requests. History
authorization and every mutation's own current availability checks remain in
place. No global setting cache or action-time setting snapshot was introduced.

## Preserved behavior and limitations

The initial document still verifies access before rendering private workspace
chrome. Session monitoring, session-bound page proofs, role/ownership checks,
snapshot-scoped client data and login/logout behavior remain in place. Static
destination banners and matching data skeletons retain the preceding release's
single loading stage. No artificial delay or global loader was added.

The preceding anonymous browser sample measured about 1.6 seconds to a fresh
sign-in form, including Clerk's development-browser handshake and five document
requests. It did not measure an authenticated dashboard or establish a cold-start
duration. These changes do not remove provider handshakes, root-to-portal redirects,
SDK download time or network faults. The separately diagnosed Wi-Fi certificate
failure is not addressed by this batch.

Region alignment should reduce database round-trip latency; the resulting user
benefit must be measured on the staged deployment. Local tests cannot establish
hosted latency, actual deployment region or external provider availability.

## Verification

TypeScript, ESLint and 976 tests across 48 files passed. The production Turbopack
build and isolated HTTP checks passed using an owned disposable database and
synthetic credentials. The HTTP checks cover unauthorized/missing-secret cron
denial, empty authenticated runs, lease release and payment webhook namespace
isolation. No live cron or payment was invoked. The generated `.next` directory
is verification-only and must not be deployed.

All 173 Chrome checks passed, including 13 real Next.js transition checks for
destination shells, sidebar state, login/logout and denied access. New unit checks
exercise concurrent profile/policy completion, private-field exclusion, fresh
verification outside an RSC render and reuse of the page's maintenance result.
Existing session, role-policy, ownership, malformed-configuration and authorization
tests passed. Git diff and new-file whitespace checks also passed.
The TSX review found no new client fetching, effects, shared mutable request state
or accessibility/layout changes.

Before release, confirm the exact candidate uses `sin1`, test signed-in entry on
the working connection, measure fresh/repeat sign-in and dashboard entry, and
retain the existing manual promotion and Preview containment settings.
