# NEU-ARRS application specification

Current source contract, reviewed 2026-11-13. This document describes the working
source, including locally completed S6, P8 and A2/Q2 remediation. It does not
assert that this source or its pending migrations are deployed. See [tasks.md](tasks.md)
for validation and rollout status. Earlier planning copies are historical only.

## Stack and structure

Next.js App Router, React, TypeScript and Tailwind form the UI. Clerk provides
account/session services; Prisma and Neon/PostgreSQL persist application data.
PayMongo handles online payments, Resend email, and optional Upstash Redis rate
limiting. Vercel hosts the app; GitHub Actions runs independent verification jobs.
Use the installed dependency versions and lockfile. Before changing framework
code, read the relevant installed `node_modules/next/dist/docs/` guide.

| Boundary | Responsibility |
| --- | --- |
| `src/app/(student)` | Authenticated student dashboard, submissions and history |
| `src/app/(admin)` | Shared employee/admin workspace; admin-only finance/configuration/role recovery |
| `src/app/(print)` | Authorized financial receipt rendering |
| `src/app/actions` | Live authorization, runtime parsing, service invocation, public results and cache effects |
| `src/lib/services` | Private request, configuration, identity/date review and notification-retry mutations |
| `src/lib/*-data.ts`, `*-model.ts`, `*-fetcher.ts` | Guarded reads, explicit DTOs, client validation and shared report policy |
| `src/app/api` | Authenticated read/export routes and separately authenticated provider/cron entry points |
| `prisma/schema.prisma`, `prisma/migrations` | Current schema and forward-only migration history |
| `src/emails` | Escaped standalone React email markup |
| `scripts`, `src/**/__tests__` | Synthetic browser fixtures, disposable database tests and operator tooling |

Server-rendered pages use guarded loaders. Client components receive explicit
serializable DTOs, not Prisma records. Actions do not query the datasource or
orchestrate providers directly. Server-only services retain transactional
invariants, audits and outbox writes; external financial calls follow commit.
Pure client monetary predicates live in `src/lib/money-policy.ts`.

## Identity and access

Roles are `student`, `employee`, and `admin`. `src/proxy.ts` performs routing
protection. Every action/read route still enforces its own live server guard.
`getVerifiedActor` verifies the live Clerk session and user (including expiry,
locked/banned state) and resolves live metadata through the durable `RoleAccess`
fence. Client metadata and submitted actor/role fields are not authority.

Students access only their own requests. Employees perform ordinary registrar
work; administrators additionally manage settings, finance, role changes and
reasoned overrides. Role changes use durable fenced operations and recoverable
session revocation. UI hiding is supplementary, never authorization.

Registrar review against school records binds an attestation to one exact
request, account, student name and number. Verification/revocation is audited
and versioned. Authentication, payment and a well-formed student number do not
verify academic identity. Staff must establish the account holder's identity
through the registrar's actual records procedure. Staff cannot attest their own
account. Existing requests are not automatically verified by migration.

## Request lifecycle and payment

New cash and online requests both begin at `PENDING_PAYMENT`. Cash uses
`CASH_ON_PICKUP`; online uses `UNPAID`. Normal transitions are:

| Current status | Allowed next status |
| --- | --- |
| `PENDING_PAYMENT` | `PROCESSING`, `CANCELLED` |
| `PROCESSING` | `READY_FOR_PICKUP`, `CANCELLED` |
| `READY_FOR_PICKUP` | `COMPLETED` |
| `COMPLETED` | None |
| `CANCELLED` | None |

Students may cancel only pending requests. Admin overrides require authorization
and a reason; they cannot bypass payment or identity invariants. Fulfillment
requires a matching active registrar attestation. Online fulfillment requires
verified payment. Cash completion requires explicit collection confirmation.
Refunded requests and cancelled online requests cannot be reopened. Paid online
requests cannot return to awaiting payment. Same-state writes are rejected.

Creation derives the owner from live auth, validates active catalog/payment
settings and freezes an integer-centavo quote. Account-scoped submission UUIDs,
durable checkout attempts, leases and provider idempotency protect retries.
Uncertain sessions/payments require reconciliation, not blind replacement.
The PayMongo webhook validates raw-body signatures, timestamp/mode/schema/size,
correlation and event uniqueness before transactional writes. A paid but
unverified request stays `PENDING_PAYMENT` with `PAID` financial state; payment
advances an eligible, reviewed pending request to processing.

Cancellation claims/audits/notification intent commit before provider work.
Refunds use authoritative canonical collection amounts and confirmed full-refund
evidence. Unknown provider outcomes require reconciliation; they are not treated
as successful refunds or blindly retried. See the [refund](docs/remediation/01-refunds.md)
and [cancellation recovery](docs/remediation/08-manual-cancellation-reconciliation.md) notes.

## Monetary evidence and reporting

`quotedAmountCentavos` is the expected price, not proof of collection. Historical
`amountPaid` contains mixed-unit legacy evidence and is never automatically
converted or included as canonical money. `RequestMoney` holds verified integer
PHP-centavo collections/refunds with provenance. Verification time is distinct
from actual occurrence time. Unknown amount/date remains unknown, not zero or
today. Historical reconciliation is explicit, evidence-based and dry-run-first.

| Report | Period basis and meaning |
| --- | --- |
| `/admin/finance` - Settled Request Values | Request submission date; eligible settled request values, excluding cancelled/refunded rows. Not a net cash ledger. |
| `/admin/finance/movements` - Money Movements | Evidenced collection/refund occurrence dates; gross collections, confirmed refunds and net recorded movements. Collections remain visible after cancellation/refund. |

Unknown dates appear in a separately labelled unallocated list/summary. Pending
or uncertain refunds are not deducted as completed refunds. Audited administrator
review can attest missing dates from original evidence without overwriting known
dates. Database guards enforce immutability/chronology. `RequestCompletion`
retains the first completion recorded by the new writer, not an inferred first
ever historical completion; later changes retain status audit history.
Receipts distinguish occurrence, verification and first recorded completion.
Use UTC storage/ISO transport and Manila (UTC+08:00) calendar report boundaries.
No report claims fee-adjusted settlement, profit or complete financial accounts.
See [P8 requirements and implementation](docs/remediation/22-finance-reporting-requirements.md).

## Read contracts, limits and recovery

Read DTOs use `documentTypeId` (stable catalog code) and `documentLabel` (display
text), plus ISO timestamp strings. Persistence `Request.documentType` and the
established create-form `documentType` field still mean the stable code.
Configured label changes do not rewrite IDs, quotes, frozen payloads or history.
`DocumentConfig.typeId` differs from the configuration row's `id`.

| Read API | Required current JSON format |
| --- | --- |
| `/api/student/requests` | `history-v3` |
| `/api/admin/requests` | `queue-v3` |
| `/api/admin/finance` | `finance-v3` |
| `/api/admin/finance/movements` | `money-movements-v2` |

Obsolete JSON formats require reload. Release clients and APIs together. CSV
headers distinguish document IDs/labels and escape formula/control prefixes.
Cancellation returns only confirmed mutation fields; clients validate and merge
them into the same request's verified cache. See [service/DTO contracts](docs/remediation/23-service-boundaries-dtos.md).
Durable checkout/notification field names and frozen bodies remain separate
persistence contracts. Keep historical migration values and older-client
rejection tests; do not delete every old status literal indiscriminately.

Student history and staff queue use server pagination and whole-result aggregates
with selective 30-second active polling. Finance/queue exports reject oversized
results rather than silently truncating (5,000-row bounds; see each loader for
byte/query limits). Undated movements have a separate ten-row page. The student
directory uses a complete bounded account snapshot (5,000 accounts/2 MB), database
aggregates and ten-row display pages. Larger directories need a paged service.

Private responses and validated caches are actor-scoped. Failed auth/role changes
hide stale private data. Root error handling and explicit refresh/retry states
cover transient failures. Catalog/settings reads do not seed data; initialization
is explicit and administrator-controlled. Saves are typed, versioned and audited.

## Jobs, notifications and operations

Exact cron paths bypass Clerk only to apply their own configured machine-secret
check. Daily schedules in `vercel.json` are cleanup at 00:00 UTC and notification
recovery at 00:05 UTC (nominally 08:00/08:05 Manila; platform scheduling precision
applies). Preserve daily plan compatibility. Cleanup considers unpaid online
requests older than three days with bounded work/leases and authoritative expiry
proof; uncertain history is flagged for review. An authorized production GET
performs real mutations and is not a connectivity smoke test.

Notification intent commits with workflow changes. The worker freezes payloads,
checks provider acceptance and uses leases, idempotency and bounded retries;
uncertain sends beyond the 23-hour window need review. Immediate delivery has a
daily fallback. Provider acceptance is not inbox delivery. General recipients
require appropriate verified sender configuration; the Resend test sender is
restricted. See [notification recovery](docs/remediation/09-durable-notifications.md).

There are 13 prepared migrations, including the pending identity-review and
financial-date additions. Default Prisma generation/validation selects no
application datasource. Operator commands require explicit
`MIGRATION_DATABASE_URL` through `prisma.migration.config.ts`; never use an
implicit application database or rewrite applied migration history. Review,
backup and rehearse upgrades before an approved application-database rollout.
`db:backfill-identities` supports legacy migration identity fields; it does not
create S6 registrar attestations. See [migration procedure](docs/remediation/04-migration-alignment.md).

Use [README.md](README.md) for verification commands and safe release guidance.
Synthetic/disposable test success is local evidence; remote CI, hosted migrations,
real registrar/provider/inbox acceptance and natural cron observation remain
separate requirements tracked in [tasks.md](tasks.md).
