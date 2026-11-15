# Controlled demo and rollback guide

Recorded November 15, 2026 (Asia/Manila), for released commit `3270a70`.
The [release record](remediation/30-controlled-demo-release-review.md) and
[audit close-out](remediation/31-audit-closeout.md) define the evidence and limits.

## Choose the intended site

| Site | Use |
| --- | --- |
| <https://neu-arrs.vercel.app> | Released application. The two original historical requests remain; they are not disposable test fixtures. Use authorized accounts for read-only demonstrations. |
| <https://neu-arrs-payments-demo.vercel.app> | Separate test datasource/auth and synthetic payment acceptance records. Online checkout was restored to disabled after testing; email is disabled. |

The Vercel environment label Production describes hosting configuration. The
accepted application scope remains a controlled demo with test identities and
test payments. Store account credentials privately; never include them in slides,
repository files or support messages.

## Short demonstration

1. **Student:** sign in yourself with an existing authorized student account.
   Open `/dashboard`, show request history and the registrar-review requirement.
   Opening `/admin` as a student should return to `/dashboard` without staff data.
   Keep the historical requests unchanged.
2. **Employee:** switch accounts yourself to an authorized employee and open
   `/admin`. Show the queue and a request's Academic identity review panel.
   Demonstrate the unverified state without checking an attestation or saving.
   Employees have ordinary registrar workflows; administrator finance and
   override capabilities are restricted.
3. **Administrator:** switch to an authorized admin. Show the queue/review panel,
   `/admin/finance` (submission-date Settled Request Values), and
   `/admin/finance/movements` (evidenced transaction-date Money Movements).
   The all-time request report flags the historical collection-evidence gap;
   the movement report keeps unknown dates/evidence separate from dated totals.
4. **Payment evidence:** use [the completed provider acceptance report](remediation/29-payment-provider-acceptance.md)
   to explain the genuine PHP 150 test payment, signed event, receipt, full test
   refund and duplicate/reconciliation checks. The final fixture is refunded;
   its paid receipt is no longer available. Its refund date remains unknown.
   A fresh demonstration transaction requires its own reviewed synthetic fixture,
   intended isolated target, test-mode/configuration check, backup and approval
   before enabling checkout or initiating provider operations.
5. **Notification evidence:** show [the owner-only acceptance result](remediation/27-owner-notification-and-cron-evidence.md).
   One synthetic message was delivered and confirmed in Inbox. General-recipient
   delivery is not accepted. Do not requeue held messages simply to make a demo
   look complete.

The application records a registrar's real attestation; it cannot perform the
external school-record check. A paid flag or receipt does not establish academic
identity. Keep unknown historical amounts/dates unknown until original evidence
supports an authorized review.

## Operating boundaries

- Keep automatic Preview deployments disabled until separate Preview services
  and credentials are accepted. Keep automatic production-domain assignment
  disabled so a future push cannot silently publish a new build.
- Keep original/test app namespaces and signing secrets separate. The original
  uses `PAYMONGO_NAMESPACE=neu-arrs` with explicit legacy acceptance while needed;
  the isolated demo uses `neu-arrs-demo` and rejects unmarked legacy resources.
  Preserve frozen checkout attempts and webhook destinations.
- Preserve the daily cleanup and notification schedules, `0 0 * * *` and
  `5 0 * * *` UTC. Nominal Manila times are 08:00/08:05; precise execution varies.
  An authorized GET to either cron route performs work. Use logs for observation.
- The two Windows evidence-capture tasks were one-time November 15 tasks and
  have finished. There is no continuing local capture/reminder service. A future
  observation needs a fresh dated plan within available log retention; save the
  successful request and matching completion result, not just a released lease.
- For an uncertain payment/refund/send, retain its original evidence and
  idempotency identity and follow the relevant [recovery report](remediation/08-manual-cancellation-reconciliation.md)
  or [notification procedure](remediation/09-durable-notifications.md).

## Release reference and rollback

| Reference | Value at this handoff |
| --- | --- |
| Vercel project / team | `neu-arrs` / `aren-john-esoens-projects` |
| Project ID | `prj_lfrVKQZwujN3TCyyZ2YVca0MljdR` |
| Current live build | `dpl_7e9rwRZ6hZ2GgUuUK5wDQDkoZ8TZ`, commit `3270a70` |
| Previous READY build | `dpl_9r2H3AVbeEaxQ4ikmW7YqcTrTDXQ`, commit `15c330c` |
| Release verification | [CI #488](https://github.com/rnjhnd/NEU-ARRS/actions/runs/43672408366), all six jobs; staged student/admin/employee checks and live student postflight passed |

These are recorded references. Re-read current deployment/alias metadata before
acting. The previous build predates this release and is not automatically safe
against later financial activity or schema changes.

1. Stop the demonstration and record the failing route, time and current build.
   Inspect bounded logs without sharing credentials or private request contents.
2. Have the owner review the previous build's schema, payment namespace, pending
   financial operations and notification compatibility. Obtain separate rollback
   authorization. No rollback is pre-authorized by this guide.
3. In the intended Vercel project, select the exact reviewed previous deployment
   and use the platform's rollback/promotion operation. Do not rebuild a different
   source revision and assume it is the recorded build.
4. Verify `neu-arrs.vercel.app` points to that exact deployment. Confirm intended
   cron targets/daily schedules, Preview containment and manual release settings.
   Check sign-in, an authorized dashboard, role boundaries and bounded runtime
   logs without initiating payments, refunds, emails or school-record decisions.
5. Retain the failed release and evidence for diagnosis. Deployment rollback does
   not undo database changes, provider transactions or sent messages; any data
   recovery needs a separate evidence-preserving plan.

No rollback, provider mutation, migration or deployment is performed by this
document. Real-student launch prerequisites remain in the
[operational limits register](remediation/31-audit-closeout.md#explicit-operational-limits-and-deferred-work).
