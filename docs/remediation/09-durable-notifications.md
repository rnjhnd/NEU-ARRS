# Batch 9: Durable notifications and recovery

Implemented locally. No production database, provider account, environment,
email, or deployment was changed. This batch covers the existing staff status
notifications and student cancellation notifications.

## Findings addressed

| Priority | Location | Finding and remediation |
| --- | --- | --- |
| High | `src/app/actions/admin.actions.ts`, `src/app/actions/request.actions.ts`, `src/lib/notification-content.ts` | A committed status could lose its email if the process stopped or Clerk/Resend failed. The status, audit event, notification sequence, and outbox intent now commit in one database transaction. An outbox insert failure rolls back the status change. |
| High | `src/lib/notification-worker.ts`, `src/app/actions/notification.actions.ts` | Retrying an uncertain send could create a duplicate or send different content under the same key. The worker freezes the recipient and complete provider payload before its first POST, uses the status audit ID as the stable idempotency identity, and preserves both across retries. Expired or credential-mismatched attempts require review. |
| Medium | `src/lib/notification-worker.ts` | Provider error responses and uncertain local saves needed explicit handling. Only a successful HTTP response containing an email UUID records acceptance. HTTP 200 error envelopes, timeouts, malformed results, and failed local acknowledgements retain the original delivery identity. |
| Medium | `src/lib/notification-worker.ts`, `src/emails/status-update-email.tsx` | Delivery needs an explicit sender, correct recipient, and deployment URL. The worker requires configured credentials, a bare sender email, an HTTPS application origin, and the student's verified primary Clerk email. There is no fallback to another address or dummy sender. React renders message text as escaped content. |
| Medium | `src/lib/notification-wakeup.ts`, `src/app/api/cron/deliver-notifications/route.ts`, `src/lib/cron-auth.ts`, `src/proxy.ts`, `vercel.json` | Inline external calls coupled workflow success to email availability, with no recovery path. Next.js `after()` now wakes a bounded worker after commit; a daily authenticated cron and admin recovery control can resume retained work. A database lease fences concurrent workers. |
| Low | Removed `src/lib/email.ts`, `package.json`, `package-lock.json` | Removed the unused immediate-send helper and Resend SDK. The worker uses explicit REST requests with timeouts and response validation. PGlite/socket test packages are aligned to `0.4.3`/`0.1.3` so the dependency tree satisfies Prisma's transitive tooling peers. |

## Transaction and delivery rules

The sixth migration, `20261111000500_notification_outbox`, adds
`Request.notificationVersion` and `NotificationOutbox`. A unique request/version
constraint prevents duplicate intents for a workflow event; a foreign key keeps
an intent attached to its request. Historical notifications are not backfilled.
The initial and earlier remediation migrations are unchanged.
The new migration is transactional, with five-second lock and 60-second
statement timeouts, so a failed DDL step does not leave a partial outbox schema.

Staff updates and student cancellations write notification intents inside their
status transactions. Staff batches load email settings once; invalid or
oversized settings use bounded defaults. Administrator reversals remain silent
unless a correction was explicitly requested. Cancellation wording does not
claim that a payment or refund has been confirmed.

All current workflow status writers increment the sequence, including payment
webhook progression and scheduled cancellation. Those two paths retain their
existing notification policy and do not introduce new emails. Before preparing
an unattempted message, the worker verifies the current owner, status, and
sequence, then checks again under a request lock after recipient lookup. An
obsolete unprepared message becomes `SUPERSEDED` without a provider POST.

States are `QUEUED`, `IN_FLIGHT`, `SENT`, `REVIEW`, and `SUPERSEDED`. `SENT` means
**Resend accepted the email**, not that the mailbox received it. Acceptance and
its `NOTIFICATION_ACCEPTED` audit commit together. Delivery/bounce webhooks and
inbox confirmation are outside this batch.

Each worker run claims the `deliver-notifications` database job lease, handles at
most ten due rows sequentially, and stops launching work after 30 seconds. Clerk
and Resend requests each have a five-second timeout. The cron route has a
60-second duration budget and the job lease lasts 120 seconds. State changes
and lease release require the owning token. A process crash leaves recoverable
`IN_FLIGHT` work; a later owner reuses its original payload and provider key.

## Retry safety and the daily fallback

The user's selected schedule is **daily fallback with immediate wake-ups**, to
preserve deployment-plan compatibility. `vercel.json` schedules notification
recovery at `5 0 * * *` (00:05 UTC); cleanup retains its separate daily job.
Deployment scheduling accuracy still applies. No sub-daily schedule is added.

The worker stores the verified recipient, sender, subject, rendered HTML,
first-attempt time, and a SHA-256 fingerprint of the Resend credential before
sending. Its provider key is `notification:<status-audit-id>`. Subsequent attempts
reuse the exact stored JSON body and key, even if recipient details, message
settings, or the application URL change. The credential itself is never stored.

Resend's documented idempotency retention is 24 hours. The application uses a
conservative **23-hour** window from preparation and refuses future-dated times
or changed credentials. It never resets this clock, replaces the key, or clones
an uncertain intent. The same restriction applies to administrator retries.
This deliberately prefers unresolved review over risking a duplicate send.

Transient errors receive exponential backoff, capped at one hour, and at most
five automatic processing cycles. The counter includes lookup/configuration
work, not just external POSTs. Terminal errors and exhausted attempts become
`REVIEW`. Backoff sets eligibility; it does not create another timer or function
invocation.

A daily cron alone cannot guarantee a second attempt inside 23 hours. An
uncertain send shortly after the daily run can expire before the next run.
Subsequent request changes or an administrator can wake due work sooner. Large
backlogs need additional manual runs because each invocation handles at most
ten rows. Delivery latency and eventual inbox delivery are not guaranteed by
this schedule.

## Administrator recovery

Open **Admin settings → Notification recovery** (`/admin/notifications`). The
server requires administrator authorization and returns only queue metadata,
in pages of 50. Email addresses, rendered bodies, credential fingerprints, and
content snapshots are not included in client props or worker logs.

- **Run due notifications** schedules a worker. Refresh delivery results after
  it runs; this action does not wait for delivery.
- For a queued/review item, correct the configuration or recipient verification
  as needed, then enter a reason and choose **Retry safely**. The action checks
  the row version, preserves the original identity/payload/attempt count, and
  audits `NOTIFICATION_RETRY_REQUESTED`. It permits five more processing cycles.
- An uncertain attempt outside the window, or under a different Resend
  credential, requires reconciliation in the original provider account. Inspect
  its event ID, first-attempt time, and provider history before deciding any
  further action. The application does not offer a blind resend or reset.

Both the page and recovery actions enforce authorization independently. Browser
fields cannot set recipients, provider payloads, credentials, or acceptance
state. `SENT`, `IN_FLIGHT`, and `SUPERSEDED` rows cannot be manually requeued.
The cron uses exact-path service authentication at both proxy and route layers;
a signed-in browser session is insufficient. Missing scheduler configuration
returns 503, incorrect/missing bearer authentication 401, and authorized
non-GET requests 405. Responses are not cached.

Outbox content and frozen payloads contain personal data in the server database.
No retention purge is introduced here. Retention/archival work must preserve
delivery identities and outstanding review evidence; it must not recreate
expired uncertain sends.

## Configuration and release

Before release, configure `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (a bare address
on the intended verified sender domain), `CLERK_SECRET_KEY`,
`NEXT_PUBLIC_APP_URL` (the intended HTTPS origin), and a strong `CRON_SECRET`.
The worker performs a server-side Clerk user lookup and requires a verified
primary email. Missing settings keep work for review; they do not undo a
previously committed status.

Apply the prepared migrations using the existing reviewed migration procedure
and an explicit `MIGRATION_DATABASE_URL`. Rehearse on a clone first. Drain old
application instances during cutover: old immediate-send code does not
participate in the new outbox identity/sequence protocol. Do not run old and new
notification writers side by side during release.

Rehearse a staff update, student cancellation, verified-primary rejection,
provider rejection, and recoverable timeout in an isolated staging environment.
Confirm the sender domain and intended dashboard link. Enabling the cron or
admin worker against a populated live queue sends real mail; do not use those
operations as connectivity-only probes. Production rollout remains separate
from this local remediation.

## Verification

- **399 tests passed across 14 files.** Coverage includes atomic producer
  failure handling, correction policy, verified-recipient selection,
  supersession/recheck races, exact payload/key reuse after uncertain sends or
  failed local acknowledgements, credential/window guards, response validation,
  bounded processing, lease ownership, and authenticated/versioned admin retry.
  Provider calls use synthetic identities and mocked responses.
- **All four migration scenarios passed with six migrations.** Checks include
  zero Prisma schema drift, actual generated-client enqueue/state changes,
  outbox rollback with the request transaction, duplicate request/version
  rejection, foreign keys, legacy data preservation, and competing job leases.
  All database tests use owned disposable instances. Native PostgreSQL/remote
  CI execution was not performed locally.
- TypeScript and focused ESLint passed. Full application lint remains at its
  existing **54 errors / 30 warnings**. No lint exceptions were added. New React
  controls use labelled forms, stable row keys, pending states, explicit errors,
  bounded server data, and event-driven actions without effects mirroring props.
- The production build passed. Real loopback HTTP checks verified both cron
  routes, authorization, method rejection, no-store responses, empty worker
  results, released database leases, and missing-secret failure. The owned
  database had no requests or notifications, preventing external mail/payment
  operations. An authenticated admin browser and real provider delivery were
  not exercised.
- `npm ls --all` passed and the complete npm audit reported **zero findings**.
  Node 24's typeless-module warning for the script's TypeScript import and
  Vite's existing future-loader warning remain non-failing tooling notices.

The `.next` output produced by `build:check` contains synthetic verification
configuration. Build again with the intended environment before deployment.

Follow-up: [batch 10 addresses shared navigation state and component structure](10-navigation-state.md).
The remaining feature-component lint backlog is documented there.

## References

- [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)
- [Clerk Backend API](https://clerk.com/docs/reference/backend-api)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- Installed Next.js guides: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`
  and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`.
