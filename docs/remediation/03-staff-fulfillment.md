# Staff fulfillment and override guards (third remediation batch)

Later [batch 8](08-manual-cancellation-reconciliation.md) adds manual checkout
closure, late-payment recording, refund submission claims, and administrator
reconciliation. Cancelled online requests can no longer be reopened, including
those still marked unpaid.

## Authorization and payment policy

The Server Action authenticates staff on every invocation. Employees can use
normal transitions: pending to processing/cancelled, processing to ready/cancelled,
and ready to completed. Reversals, skipped steps, and terminal-state corrections
require a separate requireAdmin check plus a trimmed override reason of at least
five characters. Client props or submitted role fields never grant permission.

Online requests require PAID before processing, readiness, or completion.
Cash-on-pickup requests can be prepared before collection, but completion requires
an explicit staff confirmation that cash was collected. The confirmation is
recorded in the status audit; the legacy CASH_ON_PICKUP/COMPLETED representation
remains compatible with existing reports and receipts.

Overrides cannot bypass these payment checks, reopen REFUNDED requests, move a
paid online request back to awaiting payment, or reopen a cancelled paid online
request whose refund may be pending. Such cancellations require manual payment
reconciliation; create a new request rather than reusing an uncertain payment.
Same-status updates are rejected, including repeated cancellation attempts.

## Concurrency and audit records

Staff submissions include the updatedAt version displayed for each selected
request. The action accepts 1–50 unique IDs and one matching ISO version per ID.
It validates all rows before changing any of them, then updates them in stable
ID order. Each write checks ID, updatedAt, workflow/payment states, payment method,
and payment reference. A concurrent change causes a conflict and rolls back the
entire batch, including audit writes. No refunds or notifications run before
this transaction commits. Status audits record old/new states, override reasons,
cash confirmation, and whether an online refund was requested.

Student cancellation uses the same guarded claim and commits its audit before
attempting a refund. The cleanup job now rechecks pending/unpaid/online/age
predicates at write time so it cannot cancel a newly paid or advanced request.
The job's scheduler authentication/configuration remains a separate finding.

## Refunds after cancellation

Cancellation stops fulfillment before any external refund request. Only the
winner of the cancellation claim initiates a refund. A confirmed provider result
updates REFUNDED only while the request is still cancelled and the same online
payment remains PAID. Refund-result updates and their audit records commit
together. Pending, failed, conflicting, or unrecorded results return a warning
while cancellation remains successful. Provider calls are never automatically
retried. REFUND_* audit entries retain the provider result separately from the
initial cancellation audit.

There is still no durable refund worker. A crash after cancellation commits can
leave a refundRequested audit without a result; operators must reconcile these
against PayMongo before issuing further refunds. A missing result does not prove
that PayMongo did not accept a refund. This batch does not replace the manual
reconciliation procedure documented in 01-refunds.md.

## Queue and notifications

Queue controls share the payment/transition policy with the server. Employees
see normal transitions, admins can enter override reasons, and cash completion
requires a dialog/checkbox. The bulk cash dialog retains the versions shown when
it opened. Mutations refresh the queue, and stale submissions fail explicitly.

Reversal notifications compare the original status, fixing the old comparison
against the already-updated row. Corrections require an authorized override and
explicit opt-in. Notification initialization/delivery errors cannot turn a
committed mutation into a reported failure. Durable notification delivery remains
a later batch.

No schema changes, migrations, dependency updates, or live account/database
operations are part of this batch. Tests mock Prisma, Clerk, email, and refunds;
real database concurrency and the authenticated browser flow still need staging
verification before deployment.
