# D2: current specifications and compatibility cleanup

Implemented locally on 2026-11-13. Existing S6 identity verification, P8 financial
dates/reporting, and A2/Q2 service/DTO work are preserved. This increment changes
no schema, dependency, provider resource, hosted database or deployment.

## Changes

| File | Correction |
| --- | --- |
| `spec.md` | Replaces the initial design with the actual three-role/proxy authorization model, guarded services, current statuses, registrar review, canonical money, both reports, DTO versions, limits, jobs and migration policy. |
| `tasks.md` | Replaces the all-complete initial plan with separate local implementation, validation, pending release/acceptance and additional post-batch-20 work. |
| `.gitignore` | Removes only the contradictory `spec.md`/`tasks.md` exclusions; those files were already tracked. Ignore rules for env files, scratch archives and local agent configuration are unchanged. |
| `README.md` | Links current contracts, replaces outdated finance/contract/migration guidance, labels historical reports and describes the safe release process instead of template deployment instructions. |
| `src/emails/status-update-email.tsx` | Removes the retired `PENDING` palette branch. Current statuses and the generic fallback remain. |

Before editing, five originals were copied without overwrite to ignored
`scratch/planning-before-d2-1794550200606/`. Its manifest records source/destination
paths and SHA-256 hashes; every copy was verified. Historical planning is retained
there, while the tracked root specification/checklist describe current source.
No previously modified application/test/migration file was discarded or reset.

## Compatibility retained deliberately

The Prisma enums, workflow policy and request validation remain the authority for
current status/payment values. Source scans found no remaining `PENDING` or
`CASHIER` application branch. Legacy migration fixtures still use `PENDING` to
prove upgrades preserve and translate old data. Applied migrations are unchanged.

Frozen checkout/notification payloads, hashes, idempotency identities, provider
references and legacy monetary evidence retain their established contracts.
Existing older-client rejection tests also remain. No generic search-and-delete
of historical literals, source files or assets was performed.

The email change only affects markup rendered for the retired status. Existing
frozen rendered bodies are not regenerated. The unknown-status neutral fallback
continues to display escaped text rather than imposing a new payload schema.

## Validation

Fresh D2 verification: TypeScript, ESLint and all 852 tests in 44 files passed,
including the existing email-rendering/escaping and notification-worker tests.
Local documentation links, package-script references, archive hashes, migration
inventory, stale-literal scan, Git visibility/ignore rules and whitespace checks
also passed. No new test was added for this small palette/documentation change.

The immediately preceding combined S6/P8/A2/Q2 source passed all 128 synthetic
Chrome checks, five disposable migration scenarios and the isolated production
build. Those checks were not repeated for this documentation-only/palette
increment. Their scope remains synthetic/local, not live-provider acceptance.

## Closure and remaining acceptance

D2's original code/documentation issue is addressed. All 27 original findings
now have their implementation addressed locally, including the corrected S2 API
recommendation. This does not mean all original acceptance criteria are complete.

Pending work includes the reviewed/approved combined release, current remote CI,
S6/P8 application-database migrations, real registrar acceptance, actual provider
checkout/webhook/refund validation, evidence-based historical reconciliation where
applicable, sender/inbox readiness, natural daily cron observation and production
auth/environment readiness or explicit deferrals. See [the current checklist](../../tasks.md).

No commit, push, hosted migration or deployment was performed. Automatic previews
remain contained until isolated resources are ready. Additional post-batch-20
work remains tracked separately; this cleanup does not silently mark it complete.
