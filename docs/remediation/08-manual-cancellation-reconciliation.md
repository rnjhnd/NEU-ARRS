# Manual cancellation and late-payment reconciliation (eighth remediation batch)

## Findings addressed

| Priority | Location | Risk | Resolution |
| --- | --- | --- | --- |
| High | `src/app/actions/request.actions.ts`, `admin.actions.ts`, `src/lib/cancellation-refunds.ts` | Manual unpaid cancellations stopped fulfillment while leaving hosted checkouts payable. | After the durable cancellation claim, perform bounded checkout closure/reconciliation. Preserve cancellation and return a warning if payment handling is uncertain. |
| High | `src/lib/paymongo-webhook.ts` | A valid late payment on a cancelled request left the local payment state UNPAID. | Record the correlated payment as PAID without changing CANCELLED, retain the event receipt, and flag refund review. Never automatically refund from the webhook. |
| High | `src/lib/paymongo.ts` | A second internal invocation or uncertain earlier submission had no durable payment-level refund claim. Existing provider refunds were not checked. | Require a cancelled paid request and an explicit empty refund list, then commit a globally unique submission claim before the one refund POST. Existing claims block all further automatic submissions. |
| High | `src/lib/request-workflow.ts` | An unpaid cancelled online request could be reopened while its session/payment state remained uncertain. | Prevent reopening every cancelled online request, including administrator overrides. Create a new order after reconciliation. |
| Medium | New reconciliation action and admin request details | Operators had no application workflow for verifying closure or recording provider-confirmed refunds. | Add admin-only, version-checked reconciliation with a mandatory reason, validated provider reads, guarded writes, and audit records. This action cannot create a refund. |

## Manual cancellation flow

Student ownership checks, staff/admin permissions, workflow rules, and the
transaction that claims cancellation remain in force. Cancellation and its audit
commit before external work. The audit now distinguishes a requested refund from
requested unpaid-checkout closure.

The shared completion helper processes at most three requests concurrently and
stops launching groups after a 30-second work budget. The current group settles
before it returns. Requests left unprocessed or uncertain are included in the
review warning; cancellation stays successful. This is a launch budget, not a
promise that the entire action finishes in 30 seconds. There is no background
retry worker in this batch.

For originally unpaid online requests, the helper re-reads the cancelled order
and uses the reconciliation workflow below. It never starts a refund, including
when a paid webhook arrives between cancellation and the helper. Cash and already
refunded requests do not enter automatic refund submission.

If checkout creation was already in flight when cancellation committed, its
completion saves the correlated session ID and attempts closure before returning
the changed-request error. It does not return a payable redirect or reopen the
request. A lost provider response or failed reference save still requires review;
no session ID is invented or replacement checkout created.

## Recording late payments

A signed, validated checkout-paid event can now update a CANCELLED/UNPAID online
order to CANCELLED/PAID when its student, session, mode, amount/intent, quote, and
empty local payment reference match. Payment ID/type and legacy rounded-PHP
amountPaid are recorded; the event receipt keeps the exact centavo amount.

The guarded update and unique receipt commit together. The response remains a
review outcome with `paymentRecorded: true` and the reason
`cancelled_payment_requires_refund_review`. It does not move the order into
processing or call the refund API. Duplicate events, conflicting payment IDs,
amount mismatches, refunded orders, and other terminal-state guards remain intact.

The same atomic recorder accepts a separately identified administrator
reconciliation source after an authenticated provider retrieval. Those audit
records say `source: provider_retrieval`, retain the actual operator/reason, and
are not represented as signed webhook events. Client input cannot supply the
provider resource, payment ID, amount, mode, actor, or refund proof.

## Permanent refund submission claims

The original cancellation winner may still request one automatic full refund for
an already-recorded PAID online payment, using the provider's gross centavo amount.
The refund library now additionally requires current CANCELLED state and an
explicit empty provider refunds array. A missing list or any existing refund
record stops submission and requires reconciliation.

Before POST, a short transaction rechecks/locks local eligibility and creates an
AuditLog receipt named `refund-claim:<mode>:<actual payment ID>` with action
`REFUND_SUBMISSION_CLAIMED`. Its primary-key uniqueness applies across requests
that accidentally share a payment reference, not merely across calls for one
request. Legacy intent references are resolved before choosing the claim ID.
The provider call runs after the claim commits and outside a transaction.

A crash after the claim, a timeout, a rejected/invalid response, or failure to
save the final result does not release that claim. Subsequent automatic attempts
do not POST, even if a later payment retrieval shows an empty refund list.
An empty list cannot prove that an uncertain earlier POST was never accepted.
Claims must not be deleted/reset to force a retry. Their creation establishes an
attempt reservation, not proof that money was refunded or even that POST began.

The existing confirmation rule remains: only a validated succeeded result for the
correct full payment marks REFUNDED, with its audit in the same transaction.
Pending/processing/failed/unconfirmed results preserve cancellation and require
review. Provider-side manual operations must also be coordinated by operators;
the local claim cannot serialize actions taken outside this application.

## Administrator workflow

Open an online CANCELLED request in the admin queue's **Request Details**, enter
a reason in **Cancelled payment review**, and choose **Reconcile payment**.
Employees do not see the control. The Server Action independently calls
requireAdmin before reading data or contacting PayMongo; changing client flags
does not grant permission. It validates the request ID, displayed updatedAt
version, and a trimmed 5–1000 character reason. Stale forms fail before provider
work. The modal refreshes after a result and does not close a different request
that was opened while a previous review was running.

`src/lib/cancelled-payment-reconciliation.ts` handles:

- **Known unpaid checkout:** use the verified expiry procedure from batch 7.
  Record closure only while the same cancelled/unpaid state and references still
  match. Provider errors, ongoing payments, and races return review warnings.
- **New order without a session or attempt:** lock the Request row and recheck
  the absent attempt under the lock before recording no-payable-session proof.
- **Unknown attempt/reference:** leave it for registrar/provider reconciliation;
  never recreate a checkout or infer that a timeout meant no session exists.
- **Paid session not yet recorded locally:** retrieve and validate the full
  provider resource, record its payment while preserving cancellation, then
  inspect the payment's existing refund records.
- **Recorded paid payment:** retrieve that payment using the server-held ID and
  credentials. Validate payment ID, mode, PHP gross amount/quote, refund IDs,
  currencies, amounts, statuses, and refund-to-payment linkage. Refund IDs must
  be unique. Only successful refunds that exactly total the full gross amount,
  without a pending/processing refund, can mark REFUNDED. Failed refund records
  do not contribute to the total. Partial, absent, duplicate, mismatched, or
  unconfirmed records do not finalize a refund.
- **Already recorded REFUNDED:** report that existing local state without a new
  provider operation. Historical checkout uncertainty still remains a warning.

State changes and their result audits commit together. A concurrent update wins
over a stale confirmation. The action only retrieves provider records and may
expire an unpaid checkout; it has no refund submission call. No amount or refund
claim can be supplied by a browser form.

This follows the existing PayMongo contracts for
[checkout retrieval](https://docs.paymongo.com/reference/get_checkout_sessions),
[session expiry](https://docs.paymongo.com/reference/create_checkout_sessions_id_expire),
and [full/partial refunds](https://docs.paymongo.com/docs/payment-acceptance-refunds).
Full refund reconciliation compares the sum of distinct confirmed refunds with
the original gross payment, not rounded local pesos or net proceeds. Existing
refund-creation endpoint/reason behavior from batch 1 is retained; this batch
does not migrate provider API versions.

## Recovery and limitations

Historical requests may have overwritten session references. Closing one known
legacy session or verifying one full refund does not prove that every old session
is closed. These results retain a historical-review warning. Missing references,
ambiguous payments, unsupported response shapes, or legacy intent references in
the manual read-only refund path also remain for provider-assisted review.

For an unconfirmed refund claim, inspect the cancellation, claim, result audits,
and provider payment/refund records in the original account/mode. Use this action
to record a verified completed refund. If provider records remain uncertain,
do not submit another refund. Only after independently establishing the actual
provider outcome should an authorized operator decide whether further provider
action is appropriate. The application does not clear the original claim or
automatically send a second refund.

There is no durable notification/refund worker, automatic provider-history
discovery, payment-reference reassignment UI, or automatic alert delivery in this
batch. A crash can leave work requiring the admin control or provider assistance.
Monitor cancellation-start, closure, late-payment, and refund-review audits;
absence of a result is not evidence of failure at the provider. Mail delivery
durability and historical monetary-unit repair remain separate tasks.

Important audit actions include CANCELLATION_RECONCILIATION_STARTED,
CANCELLED_CHECKOUT_CLOSURE_VERIFIED, CANCELLATION_PAYMENT_REVIEW,
CANCELLED_PAYMENT_RECONCILED, CANCELLED_REFUND_RECONCILED, and
REFUND_SUBMISSION_CLAIMED, alongside the existing refund results and signed event
receipts. Review reasons and operator reasons are stored as separate fields.

## Verification and release

- **352 tests passed** across twelve files. New coverage includes administrator
  access/input/version checks, forged provider fields, closure/timeout/history
  cases, correlated late payment recording, full/partial/pending/duplicate refund
  evidence, permanent claims after uncertain POSTs, concurrent claims across
  request IDs, post-creation cancellation closure, and bounded completion work.
- **All four migration scenarios passed**, replaying the existing five
  migrations. Actual generated-client checks verify cancelled late-payment and
  refund writes without reopening the request. Database primary-key enforcement
  rejects a duplicate payment-level claim under a different request ID. All
  synthetic writes use owned disposable databases; smoke records roll back.
- TypeScript checks and focused ESLint passed. Full application lint remains at
  the existing **54 errors / 30 warnings**; no rule exceptions were added. The
  new standalone React control uses a labelled form and pending/error handling;
  existing unrelated queue refactoring remains outside this batch.
- The production build and existing real HTTP cron smoke checks passed with the
  disposable database and synthetic keys. The new financial provider behavior
  is covered using mocked responses, not live charges/refunds. A real Clerk
  admin browser session and provider test-mode workflow still need release
  rehearsal. Remote CI/native PostgreSQL execution was not performed here.
- The complete npm audit remains at **zero findings**.

No additional schema migration or dependency change is required by this batch;
the earlier five prepared migrations must still be present in the deployed
database. Rehearse the new admin control, late paid webhook, existing-refund
reconciliation, and uncertain submission behavior in provider test mode before
release. No live database, payment, refund, account, or deployment was changed.

Follow-up: [batch 9 implements durable notification delivery and recovery](09-durable-notifications.md).
The worker limitations above describe this batch's original scope; notification
durability is addressed by that follow-up. Financial recovery remains manual.
