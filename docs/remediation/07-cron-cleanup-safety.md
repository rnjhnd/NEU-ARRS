# Cron authentication and safe unpaid cleanup (seventh remediation batch)

## Findings addressed

| Priority | Location | Previous risk | Resolution |
| --- | --- | --- | --- |
| High | `src/app/api/cron/cleanup-unpaid/route.ts` | Missing CRON_SECRET allowed execution. | Reject missing, blank, or whitespace-corrupted configuration with 503; reject missing/wrong bearer credentials with 401 before any database/provider operation. |
| High | `src/middleware.ts` (now `src/proxy.ts`) | A legitimate scheduler call was subject to Clerk login and API IP limiting. | Only the exact cleanup path uses service authentication before Clerk/Redis initialization. All other route and role rules retain the user-session path. The route independently checks the secret again. |
| High | Cleanup route and payment helpers | Database cancellation left hosted sessions payable; a payment could complete during cleanup. | Retrieve/correlate the session, expire eligible active sessions, retrieve again to confirm expired state, then perform a guarded, audited cancellation. Paid, in-flight, mismatched, or unverified sessions are not cancelled. |
| Medium | Cleanup database scan | An unbounded scan/update had no job ownership, progress cursor, or per-order cancellation audits. | Bounded keyset pagination, a database lease with ownership checks, a supporting index, stable review receipts, and atomic cancellation/audit writes. |
| Medium | Cleanup route | Redis keepalive work coupled the payment cleanup job to another service. | Remove the keepalive side effect. The scheduler path no longer initializes or calls Redis. |

## Service boundary and runtime

`src/lib/cron-auth.ts` requires exactly `Authorization: Bearer <CRON_SECRET>`.
It uses Node's timing-safe comparison for equal-length buffers. It never accepts
cookies, Clerk claims, a user-agent, a query parameter, or a missing configuration
as scheduler authorization. Authenticated methods other than GET return 405;
this prevents an automatic HEAD implementation from running the mutation. Error
and success responses set `Cache-Control: no-store`, and the route is dynamic.

The exact `/api/cron/cleanup-unpaid` path is authenticated at both the proxy and
route boundaries. Other `/api/cron/*` paths, suffixes, and nested paths do not
inherit this exemption. A valid scheduler request bypasses Clerk session handling
and Redis; ordinary public, student, and staff route rules are preserved.
The Redis rate limiter initializes lazily only on the user-request path.

The old `middleware.ts` compiled for Edge and warned that the Node crypto import
could not run there. The file/function were migrated to `src/proxy.ts`, following
the installed Next.js 16.4.6 Proxy guide. Proxy uses Node.js, and the final build
has neither the deprecated-file warning nor the Edge crypto warning. Server
actions and API routes still perform their own authorization checks.

Vercel documents bearer-secret authentication and the possibility of overlapping
or duplicate cron invocations in its
[cron management guide](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs).
The existing daily schedule in `vercel.json` is unchanged. No live environment
variable or deployment was modified.

## Provider expiry and payment races

Cleanup considers online, pending, unpaid requests older than exactly 72 hours
with no locally recorded payment ID. It loads a minimal projection, not student
names, numbers, or email addresses.

For a known session, `src/lib/checkout-expiry.ts`:

1. Validates the stored ID before constructing the fixed PayMongo API URL.
2. Retrieves the resource and verifies its ID, request/student metadata, mode,
   PHP currency, single line item, and saved amount where a quote exists.
3. Leaves paid payments for reconciliation and defers pending/processing
   payments. Unknown payment or intent states also require review.
4. Calls the expiration endpoint only for a verified active session without an
   ongoing or successful payment.
5. Retrieves the complete resource again after either a 200 or 400 expiration
   response. Only a correlated expired resource without a conflicting payment
   establishes proof of closure.

PayMongo's [expiration API](https://docs.paymongo.com/reference/create_checkout_sessions_id_expire)
can return 400 for an already-expired session, a paid payment, or an ongoing
payment. A 400 is not proof of closure. Its
[lifecycle guidance](https://docs.paymongo.com/docs/payment-channels-key-concepts)
also distinguishes QR expiry from session expiry and requires recording expiry
locally because it does not send an expiry webhook.

Each call has a five-second timeout and bypasses caching. A timeout, 404, other
HTTP failure, invalid JSON, or correlation failure leaves the request unchanged
and creates a review receipt. There is no immediate retry of an uncertain expiry
POST. On a later invocation, an expired resource can be verified with GET alone.
The job never creates a session, charges/refunds a payment, or fabricates a paid
webhook from a retrieval result.

After proof of closure, a short transaction checks job ownership, records the
expiry proof, and updates the request only if its version, owner, quote, checkout
reference, payment/reference state, workflow, and age still match. It writes the
cancellation audit in the same transaction. A webhook, staff update, or another
cancellation that won the race is preserved. If the request changed after expiry,
the expiry proof remains recorded without a cancellation audit.

## No-session and historical cases

A new intent-based request with a valid quote, no session ID, and no checkout
attempt can be cancelled without calling the provider: the creation path cannot
POST before committing an attempt. Cleanup locks the Request row first, then
rechecks the absent attempt in a separate statement. Preparation locks that same
row before inserting an attempt. This avoids a read-snapshot race even if two
updatedAt values collide within one millisecond. The final write retains the
version and absent-relation guards.

An active creation lease is deferred. An existing attempt without a saved session
or an invalid/missing new-order quote requires review. Historical requests with
no submission identity also require review, even if they have a stored session:
the previous implementation could have overwritten earlier payable references.
Cleanup can close and record the known historical session, but it does not claim
the entire payment history is resolved or automatically cancel that legacy order.
No legacy identity, price, or missing provider result is invented.

Manual student/staff cancellations and orders already marked cancelled are not
selected by this job. Their previously issued URLs and any late payments still
need a separate audited reconciliation/closure procedure. This batch makes
scheduled cleanup safe; it does not silently resolve that historical backlog.

## Bounded work and durable progress

`CronJobState` stores the cleanup job's lease token/deadline and last processed
`(createdAt, id)` cursor. A conditional write grants one 120-second lease. Every
audit/cancellation transaction checks that token and an unexpired deadline;
release/cursor writes also require the owner token. A stale invocation cannot
release a newer owner's lease or commit a cancellation after losing ownership.
An interrupted worker's lease eventually expires; no in-process lock is relied on.

The route declares a 60-second function limit. Each invocation selects at most
26 rows, processes at most 25 with concurrency three, and stops launching groups
after a 30-second work budget. It settles the whole current group before releasing
ownership. The last completed group advances the cursor, including review and
deferred rows, so unresolved early records do not permanently block later work.
The scan wraps after reaching the end. The matching composite index supports the
fixed filters and ordered scan.

Responses/logs report scanned, cancelled, deferred, review, conflict, failed,
busy, and hasMore counts as applicable. Busy invocations do no cleanup work.
Provider uncertainty is a review result, not successful cancellation. Database
or audit failures return 500; a cancellation audit failure rolls back its status
write. Failed candidates remain eligible on a later scan. Names, submitted
identity fields, provider response bodies, and credentials are not logged.

The daily cadence is unchanged, so a backlog larger than the bounded capacity
needs monitored, authenticated follow-up runs or a separately reviewed schedule
change. This is not a durable queue or an automatic notification mechanism.

Audit actions:

- `PAYMONGO_CHECKOUT_EXPIRY_VERIFIED`: stable receipt per mode/session.
- `UNPAID_CLEANUP_REVIEW`: stable receipt per request version/reason; retries do
  not create duplicate copies of the same review finding.
- `UNPAID_REQUEST_AUTO_CANCELLED`: cancellation with the exact cutoff, previous
  version, and closure/no-attempt proof, committed with the status update.

## Migration and release requirements

`20261111000400_cleanup_job_safety` adds `CronJobState` and
`Request_cleanup_scan_idx`. This is the fifth migration; the previous four
migration files remain unchanged. It does not backfill or modify existing
requests or financial/provider fields. The index build takes a database lock;
rehearse and schedule the migration appropriately for the target data volume.

Before enabling this version of the scheduled job:

1. Follow the [migration procedure](04-migration-alignment.md), apply pending
   migrations with the operator connection, and generate the matching client.
2. Configure a strong random CRON_SECRET (at least 32 random characters is
   recommended) in the intended deployment environment. Do not put its value in
   source control, query strings, or logs. Confirm that the scheduler and
   deployment use the same secret and that any deployment protection admits the
   scheduler's request; retain the route's own bearer check.
3. Drain the old cleanup handler during cutover. Rehearse provider test-mode
   expiry, a paid/in-flight refusal, and a timeout followed by verified retrieval.
4. Monitor hasMore, review/deferred counts, errors, and the audit backlog.
   Reconcile provider-paid/local-unpaid orders through the payment process.
   Do not reset attempt keys or delete the job state to bypass a review result.

An authorized GET is a real mutation, not a production health check. No live
database, provider session, account, credential, or deployment was changed while
preparing this batch.

## Verification evidence

Local verification on Node 24:

- **306 tests passed** across ten files, including route authentication,
  session closure, 400/timeout recovery, payment races, historical uncertainty,
  leases, progress/budget limits, and proxy role/path regressions.
- **Four migration scenarios passed**, replaying all five migrations with zero
  Prisma schema drift. Actual generated-client checks cover job state, ownership
  fencing, keyset queries, row locking, and attempt-relation guards. Competing
  database connections verify that only one job lease is granted and a stale
  token cannot release it. Embedded PostgreSQL is used locally; the existing CI
  native PostgreSQL job remains configured but was not executed remotely here.
- Prisma schema validation, TypeScript checks, and focused ESLint passed. The
  existing full application lint backlog is separate; no rules were disabled.
- The default production Turbopack build passed after the Proxy migration,
  including type checks, page generation, and route output.
- `npm run build:check -- --smoke-cron` passed using the real local production
  server and an owned in-memory database with synthetic provider settings:

  | Boundary | Evidence |
  | --- | --- |
  | HTTP to Proxy | Missing/wrong credentials return 401; authorized HEAD returns 405. |
  | Proxy to route | A valid bearer GET reaches the handler without a Clerk login. |
  | Route to database | The empty run returns 200 and creates/releases the actual CronJobState lease; a repeat run also succeeds. |
  | Missing configuration | A separately started server with an empty CRON_SECRET returns 503. |
  | Provider operations | No Request rows exist in the smoke database, so no provider calls can run. Expiry behavior is covered with mocked provider responses in unit tests. |

  The helper stops its owned servers and closes the database. Its `.next` output
  is verification-only and must be rebuilt with the intended environment before
  deployment. There is no browser UI for this service flow. Real Clerk account
  logins and live provider behavior were not exercised. CI's migration job now
  includes the same production smoke command independently of the lint job.

- The complete npm audit remains at **zero findings**.

Next recommended batch: manual cancellation and late-payment reconciliation,
building on the verified expiry helper without issuing duplicate refunds.

**Follow-up:** implemented in [batch 8](08-manual-cancellation-reconciliation.md).
