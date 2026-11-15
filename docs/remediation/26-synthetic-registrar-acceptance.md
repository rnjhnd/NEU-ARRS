# Controlled-demo registrar rehearsal

Completed 2026-11-14 (Asia/Manila) against application commit
`8f7aaec252d3a0b775d7189792d1fbfc4bacdf53`.

The S6 registrar-review flow passed a synthetic rehearsal through the actual
local application, its authenticated server actions, the separate Clerk test
instance, and the isolated Neon test database with all 13 migrations applied.
This demonstrates the controlled-demo workflow. It does not establish that a
registrar has verified any real student's identity against school records.

## Verified behavior

The browser submitted one new cash-on-pickup request using an explicitly
synthetic school-record fixture. Before review, the employee interface disabled
fulfillment choices. An explicit confirmation and review reference recorded an
attestation bound to that request's account, name and student number, together
with its staff actor and immutable audit evidence. Review alone left workflow
and payment state unchanged.

A student replay of the actual review action was denied. A stale employee
submission was rejected without another audit entry. After review, the employee
advanced the request to Processing through the normal interface. Revocation
removed the active attestation while preserving the verification audit and
adding revocation evidence. A current-version server request to advance after
revocation was denied. An authenticated administrator override with a valid
reason was also denied by the identity gate.

Reverification created new evidence and restored the next normal workflow
choice. The student history API and reloaded dashboard showed Processing
without exposing staff review evidence. The earlier request belonging to the
same synthetic student remained pending; review did not apply account-wide.

The rehearsal passed 13 browser/API/database checks, with the first nine
preserved at a checkpoint while the remaining test payload was corrected.
The existing focused identity integration and navigation suites also passed:
**43 tests in two files**. Their disposable-database coverage includes
self-attestation denial, input validation, exact identity binding, transactional
rollback, concurrency, and mixed-batch rejection. Those regression tests are
distinct from the actual isolated-browser rehearsal.

## Preserved data and retained fixture

All three pre-existing test requests and every pre-existing database row were
preserved, verified with before/after row fingerprints. There were no prior job
state rows to modify. At this checkpoint the database contained four synthetic
requests. The new request remains Processing, cash-on-pickup, with a current synthetic review;
it was not completed and no collection, refund, financial-date or completion
evidence was created.

The normal status-change notification wake-up ran and retained one notification
in REVIEW with `sender_not_configured`. No provider email ID or sent timestamp
was recorded. Email, PayMongo, Redis and cron credentials remained disabled.
No cron HTTP route was invoked, and this is not proof of inbox delivery or a
successful scheduled job.

All test sessions created by the attempts were revoked; zero active synthetic
sessions remained. The temporary local server was stopped. Local environment
file digests were unchanged. The original hosted database was not connected,
and no hosted settings, webhook, deployment or live domain were changed.

## Test harness corrections and remaining acceptance

The local runner required matching `localhost` request and server hostnames
after a mismatched binding produced a self-proxy connection error. The runner
used Next.js's documented Webpack development option. It also needed to wait
for hydration before filling sign-in fields, and capture the complete
administrator form payload before testing its denial. These were operator-test
corrections; no application source change was needed. Completed mutations were
preserved and the same synthetic request was reused on resumption.

Detailed local evidence is retained in the ignored scratch directory:
`registrar-rehearsal-result.json`, `registrar-rehearsal-baseline.json`,
`registrar-rehearsal-nine-check-checkpoint.json`, and
`registrar-rehearsal-focused-tests-result.json`. Browser screenshots are
diagnostic captures during UI transitions, not a visual-design acceptance.

The subsequent [owner-notification check](27-owner-notification-and-cron-evidence.md)
verified one real owner-only email and Inbox receipt, adding a fifth synthetic
request. It preserved this registrar fixture and all earlier rows.

Actual school-record operational acceptance remains unperformed. Genuine
PayMongo test checkout, signed payment delivery and refund acceptance remain
pending because separate merchant signup is paused. Natural scheduled-job
outcome evidence, final release review and separate release/promotion
authorization also remain outstanding.
