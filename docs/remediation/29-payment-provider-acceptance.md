# Isolated PayMongo payment acceptance

Verified 2026-11-14 (Asia/Manila). The controlled demonstration payment batch is
complete. Overall release and real-world operational acceptance remain open.

## Existing work preserved

The reviewed application source at `fb1ea51`, original site's minimal namespace
guard at `15c330c`, isolated Neon/Clerk resources and five earlier synthetic
requests were retained. No commit, push, merge, destructive Git operation,
original-database migration or original-site deployment occurred during the
integration acceptance run. The subsequent owner-authorized local review and
checkpoint commit are separate from that run.

## Completed integration work

The separate demo at <https://neu-arrs-payments-demo.vercel.app> uses eleven
Production-only variables, an isolated test datasource and Clerk instance, and
its own webhook signing secret. A fresh native backup was created and its
archive extraction verified before financial testing. All thirteen migrations
matched the reviewed source. Automatic Preview deployment and automatic
production-domain assignment remain disabled. Email, Redis and cron credentials
remain unset; no paid resource or real charge was used.

One synthetic student submission created one checkout with a frozen PHP 150.00
quote and `neu-arrs-demo` namespace. Student **Pay Now** recovered the same
checkout and durable provider parameters. The documented synthetic test card
completed a genuine PayMongo test-mode payment. A genuine signed delivery then
created one canonical collection under the original provider event ID. The
provider's `paid_at`, `2026-11-14T11:10:07Z`, is retained independently of the
later verification time.

Payment alone left the request awaiting registrar review. The synthetic admin
matched the explicit synthetic account/name/number fixture, recorded a
request-bound review, and moved the request to Processing. This does not attest
to any real school record. The student-owned paid receipt rendered the verified
PHP 150.00 and Manila date labels.

Cancellation through the app submitted one full test refund. PayMongo reports
one succeeded PHP 150.00 refund, the app retains one permanent submission claim,
and the request is Cancelled / Refunded. Repeat reconciliation submitted no
additional refund. The refunded request no longer renders a paid receipt.

Both finance contracts and pages passed. The collection has a provider-evidenced
transaction date. The refund remains explicitly undated (`UNKNOWN`); its
verification time was not substituted for an evidenced occurrence date.

A locally re-signed HTTP copy using the original genuine event ID returned
`200`, `outcome: duplicate` after refund. Every table in both databases was
identical before and after this replay. This final duplicate check was not a
provider-originated redelivery. The initial collection was recorded from the
actual provider's signed delivery after dashboard redelivery.

## Integration findings and fixes

| Priority | Location | Finding and implemented correction |
| --- | --- | --- |
| High | `src/lib/paymongo-webhook-verification.ts`, `src/app/api/webhooks/paymongo/route.ts` | The genuine paid event contained an immutable `processing` intent and empty payments list, while the current provider checkout was succeeded and paid. Strict parsing alone repeatedly rejected the event. Recover these snapshots using a private provider read, requiring the same checkout, namespace, owner/request, intent, currency, gross amount and uniquely linked paid payment. Unconfirmed/conflicting proof returns retryable 503 and records no money. Retain the original event receipt and transactional deduplication. |
| Medium | `src/lib/paymongo-namespace.ts` | Provider samples may omit metadata entirely. Treat omitted routing metadata as unmarked so the isolated demo ignores it. Malformed metadata remains rejected and owned/legacy payments still require full payment metadata. |
| Low | `src/app/api/webhooks/paymongo/route.ts` | Rejected authenticated payloads previously gave operators no validation stage. Log at most five field paths/error codes; exclude payload values, billing data, keys and signatures. |

Regression coverage is in
`src/app/api/webhooks/paymongo/__tests__/route.test.ts`. It includes stale/empty
snapshots, failed provider reads, conflicting namespace/mode/identity/intent/
payment/amount proof, missing payment association, authentication boundaries,
private diagnostic output and replay idempotency.

## Validation and preservation

- `npm run check`: type checking, lint and **942 tests in 45 files** passed.
- `npm run build:check -- --smoke-cron`: disposable-database production build
  and synthetic HTTP checks passed. No hosted cron route was invoked as a probe.
- The deployed build is READY. Its source is base `fb1ea51` plus reviewed patch
  `e92cd13196872a0b1fbc61bbb27372f59ef2286ac6d05875695fd3c96f98c7b6`.
  Upload provenance includes all 327 reviewed files and no credential files.
- All fourteen original tables, both original requests, the original webhook
  URL/secret/enabled state, and the original live deployment are preserved.
  Both real provider destinations acknowledged the demo event; the original
  receiver ignored the foreign namespace without database changes.
- All five prior test requests and all earlier business rows are preserved.
  The payment-availability value was restored to online disabled / cash enabled.
  Its audited version advanced. Backup comparison confirmed that only the
  notification worker's expected job `updatedAt` advanced; cursor and released
  lease state are unchanged. This immediate wake-up is not natural cron evidence.
- The two new notification rows are held in REVIEW with
  `sender_not_configured`, no provider email ID and no sent time. No new email
  was sent. Created synthetic browser sessions were revoked.
- Local environment-file hashes are unchanged. The application changes were
  uncommitted at acceptance and are included with this report in the subsequent
  owner-authorized local checkpoint. `git diff --check` passed.

Initial harness failures were resolved without changing business data: direct
node-postgres timestamp parsing needed UTC for timestamp-without-time-zone
columns, and preservation checks needed to distinguish expected worker lease
timestamps from immutable business fixtures. The provider event retrieval/retry
API paths documented by PayMongo returned 404; dashboard redelivery supplied the
genuine event and the final HTTP duplicate test is explicitly labelled above.

Detailed local evidence: `scratch/demo-payment-acceptance-final.json`,
`scratch/demo-baseline-preservation-result.json`,
`scratch/demo-provider-replay-result.json` and the protected task backup.
Deployment: `dpl_6WXfwjSCs5VahKqqC58GfuX73dm9`.

## Remaining scope

Capture successful natural daily-job outcomes and obtain required remote CI for
the reviewed checkpoint, then perform the separate final release review and
promotion. The original site has not received these broader application fixes.
Real school-record operations, live payments and broader email delivery are
outside the selected controlled-demonstration scope; their real-world acceptance
has not been claimed.

Provider references: [test cards](https://docs.paymongo.com/docs/payment-acceptance-testing),
[webhook event snapshots](https://docs.paymongo.com/docs/developer-tools-webhooks-key-concepts),
[checkout resource](https://docs.paymongo.com/reference/checkout-session-resource),
[refund API](https://docs.paymongo.com/reference/create-a-refund).
