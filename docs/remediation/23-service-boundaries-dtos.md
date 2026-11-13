# A2/Q2: service boundaries and explicit document DTOs

Implemented locally on 2026-11-13. Prior S6/P8 changes are preserved, including
identity verification, financial-date evidence, immutable completion records,
audited cancellations, notification intent and payment/refund recovery. This
increment changes no database schema or dependency and performs no hosted
migration, deployment, commit or push.

## A2 — Medium: action/service separation

Server Actions retain live role authorization, bounded runtime input parsing,
service invocation, public response/error mapping and framework cache effects.
They no longer execute datasource queries or provider/outbox orchestration.
ESLint restricts imports of those implementation modules in action entry files.

| Server-only service | Responsibility |
| --- | --- |
| `src/lib/services/student-requests.ts` | Actor-bound request creation/idempotency, frozen quote and checkout recovery, owner-scoped cancellation, atomic cancellation/audit/outbox claim and post-commit financial reconciliation. |
| `src/lib/services/staff-requests.ts` | Whole-batch validation, stable guarded transaction writes, identity/payment/override policy, cash confirmation, first recorded completion, audit/outbox and post-commit cancellation reconciliation. |
| `src/lib/services/configuration.ts` | Catalog/settings transactions, create intents, capacity/version guards, explicit default initialization and audit evidence. Cache invalidation remains in the action after commit. |
| `src/lib/services/identity-review.ts` | Registrar verify/revoke transaction and exact request/account/name/number binding. |
| `src/lib/services/movement-dates.ts` | Financial-date evidence transaction, canonical-money lock, immutable-date and chronology checks. |
| `src/lib/services/notification-retry.ts` | Versioned, audited notification retry with the original payload/idempotency identity and provider retry-window limits. |

Existing payment, checkout, role-operation and notification-worker modules remain
shared and now have explicit server-only boundaries. Pure financial predicates
live in `money-policy.ts`, so client reporting models do not import database
writer modules. Vitest replaces only the framework's server-only marker; the
production Next.js build checks the real server/client module boundary.

Internal services are not remotely callable Server Actions. Their actor IDs and
override capabilities must come from the action's live guard, never submitted
role/actor fields. Student ownership and workflow/payment/identity invariants
remain in the services, close to the mutations. A staff service call without an
administrator capability cannot perform an override. Existing role operations
and machine-authenticated webhook/cron service boundaries are retained.

External financial operations remain after successful transaction commits.
Audit, outbox, cash and completion failures still roll the affected transaction
back. The extraction retains the prior leases, optimistic versions, refund
claims, evidence checks and no-blind-retry behavior.

Student server rendering now reads request-availability settings through the
guarded configuration data layer. It no longer imports a student setting getter
from an admin action file. `getRequestSetting` delegates to the authenticated,
allowlisted read and preserves the unavailable/paused rendering behavior. The
old `getSystemSetting` Server Action is removed.

## Q2 — Medium: persistence identity versus display identity

| Boundary | Meaning |
| --- | --- |
| `Request.documentType` in persistence | Stable catalog type code, such as `TOR`. It is not replaced by a display label. |
| Established create-form field `documentType` | Catalog type code. The adapter translates it to the typed service command's `documentTypeId`; old frozen submission intents retain their transport fields. |
| `DocumentConfig.typeId` | Catalog type code; distinct from the configuration row's opaque `id`. |
| Read DTO `documentTypeId` | The original stored catalog type code. |
| Read DTO `documentLabel` | Current configured display label or a shared legacy/underscore fallback. |
| DTO timestamps | ISO strings. Database `Date` values are mapped before crossing the client boundary. |

Student history, staff queues, submitted-date finance and money movements now
carry the explicit ID/label pair. Display, search and document sorting use the
label; quotes and idempotency compare the ID. CSV headers distinguish Document
Type ID and Document Label. Renaming a configured label does not alter the
stored ID, original request/quote, frozen provider payload or monetary history.

`document-identity.ts` defines the pure identity mapping and legacy label map.
`document-identity-sql.ts` derives the matching fixed SQL expression from that
same map. Student and queue queries and movement projections share it; finance
and receipts use the corresponding pure mapper. Initial rendering and refresh
use their shared loaders and DTO contracts.

Cancellation returns only the confirmed mutation fields:

```json
{
  "id": "request-reference",
  "status": "CANCELLED",
  "paymentStatus": "PAID",
  "cancelReason": "Changed plans",
  "updatedAt": "2026-11-13T05:00:00.000Z"
}
```

This is a shape example, not a real request/refund. The client validates the
response, requires the matching request ID and cancelled state, and merges it
into verified cached rows. It retains their document identity and creation time;
it does not reconstruct a Prisma `Request`, convert strings back to database
dates, or receive student ownership/provider/quote/legacy-money internals. The
separate warning still communicates unconfirmed payment closure/refund outcomes.

## Read-contract rollout

| Read API | Current format |
| --- | --- |
| `/api/student/requests` | `history-v3` |
| `/api/admin/requests` | `queue-v3` |
| `/api/admin/finance` | `finance-v3` |
| `/api/admin/finance/movements` | `money-movements-v2` |

Student/queue document sorting now uses the allowlisted `documentLabel` key.
SQL identifiers/order fragments remain fixed; caller values are bound. Older
JSON clients receive a reload response rather than interpreting an ID as a label
or a label as an ID. Release the matching clients and APIs together and reload
old tabs. Existing CSV downloads remain self-describing through their headers.

Durable checkout and notification payload field names and frozen content are
deliberately unchanged; they are persistence/provider contracts, not the read
DTOs being corrected here. Existing pending retries keep their original payloads
and financial/notification idempotency identities.

## Validation and limits

Local validation passed: TypeScript, ESLint, 852 tests in 44 files, all 128 Chrome
checks and five disposable migration scenarios. The isolated production build
also passed. Tests cover action authorization, override capability, owner/version
guards, unchanged refund/checkout recovery, audit rollback, S6/P8 invariants,
minimal ISO mutation responses and stable IDs across configured-label changes.

The full browser suite covers forms, retry/double-submit controls, private-cache
boundaries, cancellation, staff queues, settings/roles, both finance reports,
CSV/PNG, navigation and phone layouts. These are synthetic component fixtures;
database tests use owned disposable PostgreSQL. Live provider transactions,
real registrar acceptance and hosted concurrency/remote CI are separate rollout
checks and were not performed in this increment.

S6/P8's previously prepared migrations still need the approved database/release
process before this combined source is used against an app database. This
refactor adds no further migration. Build-check `.next` output uses synthetic
configuration and is verification-only. Changes remain uncommitted/undeployed.

Remaining original work: D2 stale planning/compatibility cleanup, plus pending
rollout and payment/notification/natural-cron verification or explicit deferral.
Previously added post-batch-20 work remains separate and preserved.
