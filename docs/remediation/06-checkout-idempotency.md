# Checkout creation and retry integrity (sixth remediation batch)

## Findings addressed

| Priority | Location | Previous risk | Remediation |
| --- | --- | --- | --- |
| High | `src/app/actions/request.actions.ts` | Retrying submission created another order; repayment always created and overwrote the checkout reference, leaving multiple payable sessions. | Student-scoped submission identities, one durable checkout attempt per order, leased creation, bounded provider idempotency, and retrieval of an existing session. |
| High | `src/app/actions/request.actions.ts`, `src/lib/paymongo-webhook.ts` | Repayment accepted already-paid orders; prices were recalculated, and unknown or inactive documents used a fallback price. Webhooks compared payment to intent without an order quote. | Require owned online/pending/unpaid orders with no payment reference; validate active documents and prices; save the server quote in exact centavos and compare webhook payments to it. |
| Medium | `src/lib/checkout.ts` | Provider responses and redirect URLs were used without validation; errors exposed internal exception messages; repayment bypassed settings checks. | Validate session ID, metadata, currency, amount, mode, state, and checkout host; use timeouts, generic errors, and server availability checks. |
| Medium | Student request form and request list | Lost action responses or thrown promises could strand loading controls or encourage another submission. | Retain the intent UUID across retries in the tab, guard double clicks, show saved-order recovery messages, and clear loading state after failures. |

## Order identity and quotes

The client supplies a UUID for one submission intent. Only the authenticated
student ID establishes ownership. `Request(studentId, submissionKey)` is unique,
so concurrent invocations converge on one order, including cash submissions.
Reusing an identity with different normalized request fields returns the existing
order ID and an error, rather than modifying or creating an order. A newly
generated identity represents a new order; this is not a policy against a student
intentionally requesting the same document twice.

The form stores only the intent UUID in versioned session storage, never identity
fields or credentials. It keeps the UUID after an unconfirmed network response,
including a form reload within that tab. Storage failures fall back to an
in-memory UUID; cross-reload deduplication then requires checking the dashboard.
Once the server confirms an order ID, recovery moves to that order's dashboard
payment action instead of submitting another order.

New requests snapshot `quotedAmountCentavos` from an active server-side
DocumentConfig. Submitted prices and student IDs are ignored. Online prices must
be integral and at least 100 centavos; valid zero-price cash documents remain
zero. Missing, inactive, negative, fractional, or out-of-range prices do not use
a fallback. The legacy rounded-PHP `amountPaid` field is unchanged; the quote
does not perform the deferred historical currency migration.

Maintenance/payment settings are checked before new orders and every checkout
resume. Malformed stored settings or failed lookups stop the operation. Absent
settings retain the application's initial defaults (maintenance off, both methods
enabled). Cash intent replays return the existing order without creating another
order, even if availability later changes.

## Durable provider attempts

`CheckoutAttempt` has one row per request, a globally unique provider UUID key,
the frozen request JSON, mode, credential fingerprint, creation timestamp, and
lease deadline. It has a foreign key to Request. The row and guarded quote write
commit before a provider POST. No API key is persisted; the credential fingerprint
is a SHA-256 digest of the high-entropy secret key.

A conditional database write grants a 30-second creation lease only while the
order remains eligible and lacks a checkout reference. The network timeout is
10 seconds. A concurrent caller cannot claim the same active lease. API calls
run outside database transactions. Conflict responses return an explicit refresh
or wait message without automatically issuing another POST.

If the provider response is lost, the process exits, or saving the provider ID
fails, another invocation can retry after the lease using the exact stored body
and provider key. Changes to titles, current prices, or application URLs do not
change that body. Automatic POST recovery stops 23 hours after attempt creation,
leaving a margin before the provider's key expiry. Mode changes, credential
changes, and timestamps in the future also require manual review. The key or
attempt row is never automatically reset.

This uses PayMongo's documented creation
[idempotency contract](https://docs.paymongo.com/reference/idempotent-requests):
the same key replays a result, changed parameters are rejected, and keys expire
after 24 hours. It provides bounded recovery, not an indefinite exactly-once
guarantee across the provider/database boundary.

Once a checkout ID is stored, the action only
[retrieves that session](https://docs.paymongo.com/reference/get_checkout_sessions).
It does not create a replacement, including on retrieval errors or a 404.
An active, unpaid session can reuse its validated hosted URL. Expired sessions
and paid/pending/processing payments require confirmation or registrar review.
The API reference documents the
[session lifecycle](https://docs.paymongo.com/docs/payment-channels-key-concepts):
an active session may be resumed, and a replacement must not be created while
the original remains payable. This batch retains the existing v1 endpoint;
migrating to v2 and adding pass-on fees is separate work.

## Response and state integrity

The response must describe the correct student/order, mode, PHP amount, and one
line item. Hosted redirects must use HTTPS on `checkout.paymongo.com`, without
credentials or a custom port. New payloads require an explicitly configured
`NEXT_PUBLIC_APP_URL`; production return URLs require HTTPS. HTTP loopback is
allowed only outside production. The immutable payload stores these return URLs
for recovery and never derives them from a client-supplied host.

After the API call, the provider ID is saved only if the order has no existing
checkout reference. It is never overwritten. The action re-reads eligibility
before returning a payment URL. If cancellation or payment confirmation won in
the meantime, no redirect is returned and the terminal/payment state is preserved.
A correlated provider ID is retained even on a concurrently cancelled order so
that a late webhook can record a review receipt rather than lose the reference.

Webhooks now compare the paid amount with `quotedAmountCentavos` as well as the
provider intent. Mismatches receive durable PAYMONGO_PAYMENT_REVIEW receipts and
do not mark the order paid or processing. The quote also participates in the
guarded payment update. Audits distinguish the saved order quote, actual payment,
and provider intent amounts. Existing terminal-state and duplicate-event guards
remain in force.

## Historical requests and manual reconciliation

The migration deliberately leaves submission identities and quotes null for all
existing orders, preserving financial fields and provider references.

- A historical order with a stored session can retrieve and resume that same
  validated provider session. Its original line item is checked for a valid PHP
  amount, but its historical expected order price is unknown. Webhook audits
  explicitly retain a null expected quote rather than inventing one from today's
  DocumentConfig or rounded `amountPaid`.
- A historical order without a session reference cannot automatically create a
  session. The old POST might have succeeded before its reference save failed.
  The user receives a registrar-review message.
- An attempt with no saved session that passes the retry window, changes mode or
  credentials, or repeatedly returns an invalid result also requires review.

For these cases, inspect the order, attempt key/time/frozen payload, and existing
PAYMONGO_PAYMENT_REVIEW receipts. Verify the original account and mode with the
provider using the order's metadata and payment records. Reconcile paid payments
through the existing audited process; if an existing session is found, verify
its order/student/amount before recording its reference. Do not delete the
attempt, replace its key, or create another payable order simply because a local
result is missing. A dedicated audited reconciliation UI is not part of this
batch.

Cancellation still does not expire the provider session. Previously issued URLs
may remain payable; late payments on cancelled orders are recorded for review,
not silently fulfilled. Provider expiration and safe cleanup require a separate
batch. No automatic session replacement or background provider retry worker was
introduced here.

**Follow-up:** [batch 7](07-cron-cleanup-safety.md) verifies session expiry before
scheduled cleanup cancellation. Manual student/staff cancellation and previously
cancelled orders remain separate reconciliation work.

## Migration and release

`20261111000300_checkout_idempotency` is additive: nullable Request fields, a
student-scoped unique index, and the new attempt table/index/foreign key. The
three existing migration files remain unchanged. No historical prices or
submission identities are backfilled.

Before releasing this code, apply pending migrations using the operator
connection and the [migration procedure](04-migration-alignment.md), then generate
the matching Prisma client. Pause checkout submissions and drain the old action
instances during cutover so that the previous implementation cannot continue
creating replacement sessions. Old open browser forms must refresh to obtain
the new submission-key behavior. Rehearse a provider test-mode creation, resume,
timeout recovery, and paid webhook before enabling submissions in production.

No live database, account, session, or deployment was changed during remediation.

## Verification

Local results: **244 tests passed**, **all four migration scenarios passed**,
Prisma schema validation and TypeScript checks passed, the production build
passed, and the complete npm audit still reports zero findings. Focused lint
checks pass for the new checkout code, tests, form, and migration tooling. Full
application lint reports 54 existing errors and 30 warnings; no new rule
exceptions were added.

- Unit tests cover initial and cash intent replay, concurrent identical
  submissions, request ownership and eligibility, settings and config validation,
  immutable provider parameters, lease contention, unknown POST results, failed
  local saves, key expiry and credential changes, provider response validation,
  cancellation/payment races, and webhook order-price mismatches.
- Migration tests replay all four migrations, verify zero Prisma schema drift,
  and exercise the generated client's attempt/quote/lease operations. An added
  scenario verifies nullable/scoped uniqueness, attempt key uniqueness, foreign
  keys, and competing claims through two disposable database connections.
  Local tests use embedded PostgreSQL; CI's existing native PostgreSQL job runs
  the same scenario. Native server/remote CI execution was not performed locally.
- The production build runs against an owned disposable database and synthetic
  credentials. Provider calls in unit tests are mocked; no actual charge or
  provider idempotency replay was attempted.
- Existing application lint issues and deprecated tooling documented in batch 5
  remain separate. No lint rules or checks were disabled.

Next recommended batch: cron authentication and unpaid-request cleanup safety,
including the handling of provider sessions that can still receive a payment.
