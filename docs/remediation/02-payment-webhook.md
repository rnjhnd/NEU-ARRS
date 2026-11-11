# Payment webhook hardening (second remediation batch)

## Verification

The handler verifies HMAC-SHA256 over the original request bytes. It accepts the
`te` signature only for `sk_test_...` configuration and `li` only for `sk_live_...`.
`PAYMONGO_WEBHOOK_SECRET` and a recognized `PAYMONGO_SECRET_KEY` are required;
misconfiguration returns 503 without processing data. The signed event's
`livemode` must match the configured mode.

Delivery signatures have a five-minute tolerance in both directions. This uses
the header timestamp, not `attributes.created_at`: an old event can arrive in a
freshly signed delivery. Servers must have accurate clocks. Actual streamed
payloads are bounded to 256 KiB, independently of Content-Length.

Only `checkout_session.payment.paid` is handled. A valid signed unsupported event
is acknowledged without mutations. Recognized events require a checkout ID,
request/student metadata, a succeeded payment intent, and valid PHP centavo
amounts. There must be exactly one paid payment matching the intent's amount
and reference. An intent's existence alone never establishes payment.

The signed intent captures the checkout amount. It is intentionally compared
with the paid gross amount instead of today's mutable DocumentConfig price.

## Atomic recording and duplicate deliveries

This batch uses the existing AuditLog table as a durable event receipt. IDs are
`paymongo:test:<eventId>` or `paymongo:live:<eventId>`. The table's primary-key
constraint prevents two transactions from committing the same event. Request
changes and the receipt commit in one Prisma transaction. Any storage failure
returns 500 and rolls back the transaction so the delivery remains retryable.

Repeated events return 200 without applying another mutation. A concurrent
unique-key error is acknowledged as a duplicate only after finding the receipt.
These audit rows are financial event records: retain them rather than treating
them as disposable application logs.

Only an online request with matching checkout/student IDs, PENDING_PAYMENT,
UNPAID, and no stored payment ID can advance to PROCESSING/PAID. The final update
rechecks these predicates to avoid overwriting a concurrent change. A new event
describing the same recorded payment preserves the existing workflow state.

The application continues storing rounded PHP in Request.amountPaid for
compatibility. Every webhook receipt additionally records exact centavos for
reconciliation and the later currency migration.

## Manual review

Late payments for cancelled/refunded/completed requests, unmatched checkouts,
amount mismatches, ambiguous payments, and concurrent state changes do not reopen
requests or overwrite payment records. A PAYMONGO_PAYMENT_REVIEW audit entry
records the request, event, checkout, intent, paid payment IDs, centavo amounts,
and reason. The handler acknowledges only after this receipt is committed.

The registrar must review these audit entries against PayMongo and resolve real
payments/refunds manually. Acknowledgement means the exception was recorded,
not that the request was fulfilled. Replaying an acknowledged event will not
reprocess it; resolve its review record through a deliberate reconciliation
procedure. There is no automated review queue or refund reconciliation yet.

## Scope and deployment checks

This change needs the existing current-schema AuditLog table; it adds no database
model or migration. The broader migration-history repair remains a separate
batch. No production database or provider account was modified during local
verification. Before release, verify delivery signatures, clock tolerance, and
payload shapes using PayMongo test mode against a staging database.

Staff fulfillment/override guards and races originating in other mutation paths
are separate findings. This batch protects the webhook's own writes and does not
claim to fix those paths. Checkout-attempt history, canonical currency storage,
dependency updates, and background processing also remain separate batches.

## Provider references

- https://docs.paymongo.com/docs/developer-tools-webhook-setup-management
- https://docs.paymongo.com/docs/developer-tools-best-practices
- https://docs.paymongo.com/docs/developer-tools-webhooks-events
