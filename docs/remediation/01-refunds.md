# Refund correctness (first remediation batch)

The existing request writers store rounded PHP in `Request.amountPaid`, despite
the Prisma field comment saying centavos. This batch intentionally does not
reinterpret or rewrite historical amounts. A full refund retrieves the original
payment from PayMongo and uses its validated gross integer centavo amount. This
also preserves fractional pesos that the legacy field has already lost.

## Result handling

- Only a refund response for the same payment, exact full amount, PHP currency,
  and `succeeded` status permits `PaymentStatus.REFUNDED`.
- `pending`/`processing` refunds leave payment status as `PAID`; cancellation still
  stops fulfillment and returns a visible warning. The cancellation audit record
  stores the provider refund ID, amount in centavos, and status.
- Rejected, malformed, or uncertain responses also leave payment status as `PAID`
  and require manual verification. Refund POSTs are never retried automatically.
- Legacy payment-intent references must resolve to exactly one paid payment;
  ambiguous intents require manual review.

## Operational follow-up

Until a later batch adds durable refund reconciliation, the registrar must check
warned cancellations in PayMongo. Use `AuditLog.requestId` to find the structured
refund result in `details`; retrieve the recorded refund ID to confirm its current
provider status. A timeout may mean PayMongo accepted the operation even when no
refund ID reached this application. Check the payment's refunds before issuing
any further refund. Do not treat `PAID` on a cancelled request as proof that a
refund was never submitted.

Concurrency/idempotency, webhook hardening, fulfillment guards, canonical currency
storage/migrations, and dependency upgrades remain separate remediation batches.
This change does not claim to resolve those audit findings.

## Contract references

PayMongo's guide differs from its endpoint/resource reference on the URL and
allowed reason values. This implementation retains the explicit API reference's
`POST https://api.paymongo.com/refunds` and `requested_by_customer` reason:

- https://docs.paymongo.com/reference/create-a-refund
- https://docs.paymongo.com/reference/refund-resource
- https://docs.paymongo.com/reference/retrieve-a-payment
- https://docs.paymongo.com/reference/payment-source
