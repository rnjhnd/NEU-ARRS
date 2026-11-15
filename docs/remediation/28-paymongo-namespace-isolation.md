# PayMongo application namespace isolation

Implemented locally on 2026-11-14 (Asia/Manila), after the paused-signup review.
This change is not deployed and does not complete genuine PayMongo acceptance.
No merchant setting, webhook, original database, credential or schedule changed.

## Problem and resulting behavior

A merchant can deliver the same test payment event to both the original and
demo endpoints. Previously an unknown demo request produced a review audit in
the original database. A second endpoint alone therefore did not preserve the
original records.

New checkout metadata includes a server-owned `appNamespace`. The webhook
verifies the raw signature, timestamp and event mode, then validates a narrow
checkout routing envelope. A signed foreign namespace receives HTTP 200 with
an ignored result before any transaction, request lookup, audit or ledger write.
The routing envelope deliberately does not require a foreign application's
private request-ID/payment schema. Owned events still undergo full payment
validation, correlation, audit review, canonical money recording and deduplication.
Unsigned, stale, invalid-mode and malformed-routing events retain rejection.

The same namespace policy is enforced when recording a payment directly during
reconciliation. A foreign event pointing to a real request ID cannot bypass the
boundary. Unknown IDs within an owned namespace still create payment-review
evidence; they are not silently discarded.

## Explicit configuration and compatibility

| Target | `PAYMONGO_NAMESPACE` | `PAYMONGO_ACCEPT_LEGACY` |
| --- | --- | --- |
| Original application | `neu-arrs` | `true` while old unmarked sessions remain |
| Isolated demo | `neu-arrs-demo` | `false` |

Both settings are required and are server-only. The namespace is a lowercase
slug of 3-64 characters. Missing/malformed configuration returns webhook HTTP
503, allowing provider retries instead of silently acknowledging payments under
an unintended default. Only `neu-arrs` may enable legacy compatibility. Neither
browser form fields nor the shared Vercel Production target select ownership.

The original app can continue receiving old unmarked checkouts when explicitly
configured for legacy compatibility. The demo ignores those events without
database access. Existing original frozen checkout payloads are replayed
unchanged, including their absent marker; they are not retagged. Moving a saved
attempt to another namespace stops before claiming its lease or posting a new
provider session.

New session creation ignores a client-supplied namespace and uses only the
server policy. Provider responses and known-session recovery must match request,
student, quote, provider mode and namespace before a checkout URL is returned
or a provider reference saved. Checkout expiry checks namespace on both reads
and never expires a foreign session.

Before an automatic refund or paid cancellation reconciliation, a stored
checkout is retrieved to verify its namespace, request/student/quote, mode and
association with the paid payment ID. Failure prevents the refund POST,
monetary claim or refund-state change. Original historical records with no
checkout reference retain their existing refund path only under explicit
original legacy compatibility; the demo cannot use that exception. Automatic
refunds also require the retrieved payment's mode to match the configured key.
The extra checkout GET has a five-second timeout and is never treated as proof
of a refund or expiry when it fails.

Application namespaces share one merchant and are not an independent provider
security boundary. Correct per-project settings and separate webhook signing
secrets must be verified before any shared-merchant test. No API key values or
namespace settings were changed during local implementation.

## Locations and validation

`src/lib/paymongo-namespace.ts` owns configuration, namespace matching and the
narrow routing schema. `paymongo-checkout.ts` retains metadata and provides paid
checkout ownership proof. Creation/recovery, expiry, direct payment recording,
refund and cancellation reconciliation all use the same policy.

Regressions cover both directions, demo rejection of unmarked legacy events,
exact configuration, marked owned events, owned unknown-request review,
signature/timestamp/mode checks, forged form values, frozen attempt replay,
retrieval, expiry, refunds and reconciliation. Disposable PostgreSQL-compatible
integration checks compare actual request/audit/money/evidence snapshots and
assert no application database calls for foreign deliveries.

The isolated build receives synthetic namespace settings. Its existing
`--smoke-cron` verification additionally starts owned production HTTP servers
to check both receiver policies, signature rejection, configuration errors and
unchanged financial/audit tables. It uses only synthetic credentials and an
owned disposable database; no real PayMongo call is part of these checks.

Validation completed locally:

- `npm run check`: type checking, lint and all 910 tests in 45 files passed.
- `npm run build:check -- --smoke-cron`: production build and actual HTTP
  cron/webhook checks passed with synthetic credentials and a disposable DB.
- Signed foreign deliveries were ignored in both directions, and the demo
  ignored unmarked deliveries. Financial/audit tables remained unchanged.
- Invalid/stale signatures returned 401; missing namespace returned 503.
- `git diff --check` passed. Local environment-file hashes remained unchanged.

The first HTTP attempt exposed a loopback-hostname mismatch in the smoke
harness. A diagnostic trace showed repeated local forwarding from 127.0.0.1 to
localhost. Aligning its listener and request hostname resolved the loop; no
application middleware or authentication change was needed.

The paid-checkout association check follows the documented Payment resource
statuses (`pending`, `failed`, `paid`), with refunds represented separately.
Provider behavior after a genuine test refund still needs operational acceptance.
References: [Payment resource](https://docs.paymongo.com/reference/payment-source)
and [Refund resource](https://docs.paymongo.com/reference/refund-resource).

## Rollout boundary

The existing live deployment remains on its earlier code. Local rejection tests
do not make shared-merchant checkout safe against that unchanged receiver.
Keep its endpoint enabled and preserve its current URL/secret and original
records. No real test checkout is authorized by this document.

A minimal legacy-compatible patch can consist only of the existing webhook
route change and the new namespace module: the route's baseline matches live
commit `5892904`. Routing reads raw metadata before the old payment schema can
strip the new field, so the broader identity/reporting/service changes need not
be promoted to install the receiver guard. That patch still requires its own
review, validation and explicit publication/deployment authorization.

Prepared local artifact: `scratch/paymongo-legacy-namespace.patch`, containing
only the route and helper. `git apply --check` passed against a temporary copy
of the original route at full commit
`589290466be77a539f1581a928a40dc8df51b90e`. This establishes patch compatibility;
it is not full CI evidence for a separate legacy release candidate. The result
and artifact checksum are in `scratch/paymongo-legacy-namespace-patch-result.json`.
The real worktree/index was not changed by that check.

Before requesting a live rollout, prepare the exact original-app configuration,
minimal candidate, CI evidence, rollback target and signed endpoint-specific
no-write check. Require the original receiver guard and configuration to be
active before a demo checkout can be generated. Then finish the separate demo
deployment with its own namespace, signing secret, test database and Clerk
instance; perform genuine test checkout, signed webhook, ledger/date, full
refund, replay and reporting/receipt acceptance. Confirm original-record
preservation after those tests. None of these remote steps has run here.
