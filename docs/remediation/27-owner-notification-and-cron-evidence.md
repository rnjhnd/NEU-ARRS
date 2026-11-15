# Owner-only notification delivery and daily-job evidence

Owner delivery checked 2026-11-14 (Asia/Manila), using application commit
`8f7aaec252d3a0b775d7189792d1fbfc4bacdf53`. Natural job outcomes checked
2026-11-15 on live commit `15c330cd70e4213364826da47bdfb2a68b7cf543`.

Release follow-up: later on November 15, the owner authorized promotion of
`3270a70`. The morning captures below remain evidence for the earlier build;
they do not assert a natural execution of the newly promoted build. Current
release/deferral status is in [30](30-controlled-demo-release-review.md) and
[the close-out](31-audit-closeout.md).

## Notification outcome

One explicitly synthetic notification was sent to the owner's Resend account
mailbox through the actual application outbox worker. The provider returned
HTTP 200 and an email ID. The isolated database recorded SENT, one attempt,
the matching provider ID, a send timestamp and a NOTIFICATION_ACCEPTED audit.
The Resend dashboard independently showed the matching subject, recipient,
body, Sent event and Delivered event at **11:34 AM Manila time**.

The owner confirmed receipt in Inbox for that single test email. This completes
the owner-only delivery check: application acceptance, provider Delivered status
and the owner's Inbox observation are separately evidenced.

The subject is `Document Request Update: SYNTHETIC OWNER-ONLY DELIVERY TEST`.
The body states that it represents no real academic request, payment or
registrar decision. Its generic portal button points to the existing app; the
message explicitly explains that the isolated fixture will not appear there.
This is a worker/provider delivery check, not a hosted demonstration of that
fixture's entire student journey.

## Isolation and duplicate prevention

The test used the separate Clerk development instance and isolated Neon test
database. A dedicated owner-recipient fixture was added through the Clerk
Backend API without a staff role, password or session. One clearly marked,
already-cancelled synthetic request and its outbox/audit evidence were added;
no real request was cancelled and no identity attestation was asserted.

The application enqueue helper and notification worker were loaded in an
operator-only Node server-module harness. Product source files were unchanged.
The fixture was queued using the application's enqueue helper. Real Clerk
recipient lookup and real Resend delivery were used; neither provider response
was mocked. An outbound guard allowed only the exact verified owner recipient,
prepared body hash, endpoint and idempotency key, with a maximum of one send
POST. A second worker run processed zero rows and made no duplicate send.

All four earlier test requests and every prior test database row were preserved
with row fingerprints. At this checkpoint the test database contained five
synthetic requests; money, movement-date and completion evidence remain empty. The earlier
registrar-rehearsal notification remains in REVIEW and was not requeued. There
are no queued/in-flight notification candidates or active test sessions, and
the worker lease is released.

The existing key was reused only in the operator process. No API key was
created, revealed or granted broader permissions. Local environment files
remain unchanged with sender/payment/cron credentials disabled. Original
hosted records, saved environment variables, webhooks, deployments and domains
were not modified by this delivery check. No paid resource was created.

## Restricted key clarification

The preserved Resend key's earlier GET /domains response was HTTP 401 with
`restricted_api_key`. The dashboard showed Sending access. This was a
permission restriction, not proof that the key was invalid; the successful
real send now confirms its sending capability. It does not establish which
key is stored in Vercel's inaccessible saved Secret value.

The current `onboarding@resend.dev` sender remains limited to the owner's
mailbox. General-recipient delivery still needs a verified sending domain;
this test does not remove that limitation. See the
[Resend domain restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## Daily-job evidence: November 14 preparation

Read-only queries of the original hosted database observed new job activity on
November 14:

| Job | Latest durable activity, Manila time | Lease / cursor |
| --- | --- | --- |
| cleanup-unpaid | 08:47:05.457 | Released; no cursor |
| deliver-notifications | 08:54:24.586 | Released; no cursor |

The original database still contained two requests and no notification outbox
rows. The cleanup audit evidence from November 13 was unchanged. The new
timestamps are consistent with daily scheduled activity, but lease release also
runs on failure; they do not prove a successful response or scheduler origin.
The owner-only email was delivered by the isolated operator worker, not by a
Vercel scheduled invocation.

The bounded live-deployment runtime-log query at 11:22 AM covered only the
preceding 30 minutes and returned no cron records. The morning activity was
outside that window. A read-only observability-query attempt returned HTTP
400 and supplied no usable outcome evidence. No paid observability feature
was enabled, no schedule was changed, and no cron HTTP route was invoked.

At that checkpoint, successful natural-run acceptance remained pending. The next
morning's plan was to capture the two jobs' filtered runtime logs near
**08:50 AM**, then check again near **09:05 AM**, retaining the first results.
The plan required verifying the live deployment, actual invocation time, HTTP
result and each route's completion log/result. It spanned Hobby's hour-level timing without
manually executing business jobs or changing the daily schedules. See
[Vercel's cron logging and timing guidance](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs).

The owner subsequently authorized unattended collection. Two one-time Windows
tasks were registered under the existing signed-in account after a successful
scheduled preflight. No password was stored. These collectors only read Vercel
logs and the original database; they never call the cron routes.

## November 15 retained outcomes

Both collectors ran at their configured Manila times, **08:50** and **09:05**,
with exit code 0 and zero missed runs. Both samples resolved live deployment
`dpl_9r2H3AVbeEaxQ4ikmW7YqcTrTDXQ`; neither log response was truncated.
The first sample retained cleanup evidence before notification execution. The
second retained successful requests and matching completion logs for both jobs:

| Job | Request / completion, Manila time | HTTP and application result |
| --- | --- | --- |
| cleanup-unpaid | 08:46:56.118 / 08:47:04.835 | GET 200; success true, scanned 1, review 1, cancelled 0, failed 0, hasMore false |
| deliver-notifications | 08:54:19.163 / 08:54:24.166 | GET 200; worker completed, processed 0, accepted 0, retrying 0, review 0 |

Each completion was correlated to its request by request ID. Read-only database
snapshots corroborated the same job activity with released leases, no cursors,
two original requests and no notification outbox rows. The notification run
validly had no work; it does not demonstrate a scheduled email delivery. Cleanup
retained a review case rather than cancelling it, with no reported failures.

Successful outcomes are now evidenced, independently of lease release. The
collectors neither triggered the jobs nor changed application settings.

## Scheduler attribution limit

An authenticated, read-only `vercel crons ls` confirmed both deployed definitions
active, with schedules `0 0 * * *` and `5 0 * * *`, no pending local changes,
and a host matching both captured requests. The request timing is consistent
with those daily hours. Both requests used the expected cron user-agent and
passed routes protected by the configured bearer secret. No operator invocation
was made during this observation.

These signals strongly support scheduler attribution, but are not a separately
verified provider execution record. The request-log schema contains no scheduler
execution ID or trigger-origin field. The authenticated Vercel Cron Jobs page
labels the feature Legacy, shows both jobs Active and both invocation/duration
metrics unavailable, and directs users to Schedules for execution history.
No scheduler migration, paid feature, manual run or security-setting change
was performed to close this gap.

Scheduler origin therefore remains explicitly unverified under the earlier
independent-history criterion. On November 15, the owner accepted the saved
corroborating evidence and this limitation for the controlled demonstration.
The demo's cron-evidence gate is satisfied under that scoped acceptance; no
independent provider execution record is claimed. This decision does not
authorize committing, publishing, merging or deploying. Waiting for another
daily run alone would not add the missing history field. A stricter criterion
for future real-world use needs a separately reviewed evidence strategy.

## Validation and retained evidence

All **120 focused tests in five files** passed: notification worker, cron
authorization, cleanup route, email rendering and notification actions.
Read-only postflight checks confirmed one durable send, unchanged previous
rows and local environment digests, zero active sessions and a released lease.

Detailed local evidence is retained under ignored `scratch/`:
`owner-notification-result.json`, `owner-notification-postflight-result.json`,
`owner-notification-baseline.json`, `owner-notification-preview.html`,
`notifications-cron-preflight-20261114.json`,
`cron-capture-scheduling-result.json`, `cron-natural-run-20261115-0850.json`,
`cron-natural-run-20261115-0905.json`, `cron-scheduler-origin-inspection.json`
and `cron-capture-review-result.json`.

Full original operational acceptance remains incomplete. Natural cron outcomes
and owner-only delivery have passed; independent scheduler attribution remains
limited as above. Genuine PayMongo test acceptance is recorded separately in
`29-payment-provider-acceptance.md`. Real school-record checks, broader email,
live payments and separate release authorization retain their own statuses.
