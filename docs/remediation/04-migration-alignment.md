# Database schema and migration alignment (fourth remediation batch)

## Changes

The original `20260608114857_init` migration remains unchanged. Two forward
migrations now reproduce the current Prisma schema:

- `20261111000100_expand_request_schema` adds REFUNDED, the document/settings/audit
  tables and indexes, and nullable student identity fields. It converts the
  document enum to text without changing document IDs, then removes that unused
  enum type.
- `20261111000200_contract_request_schema` requires verified nonblank identities,
  makes the identity columns required, audits/maps legacy PENDING rows to
  PENDING_PAYMENT, and removes PENDING from the status enum.

PENDING is mapped conservatively to the existing payment/review queue. Neither
paid online nor cash requests automatically begin processing. Payment status,
amounts, provider references, document IDs, request IDs, and createdAt are
preserved. Identity/status changes advance updatedAt so stale actions cannot
silently reuse old versions; audits retain the previous timestamp.

No automatic currency conversion is performed. Historical amountPaid values may
have different units, while current writers use rounded PHP. The schema comment
now states that limitation. Reconciliation and canonical centavo storage need a
separate, data-aware migration.

## Local verification

```sh
npm run test:migrations
```

The default runner creates only owned in-memory PostgreSQL instances on loopback.
It ignores all ambient application and migration database URLs, never reads
`.env.local`, and closes its instances afterward. It verifies:

- Fresh Prisma migrate deploy, repeat deploy, zero schema drift, and actual
  Prisma CRUD across all current models, including guarded status writes and
  REFUNDED. Synthetic ORM records are rolled back.
- Populated legacy SQL upgrades, the identity guard's rollback, verified
  backfills, and preservation of all financial/document/provider fields.
- Backfill coverage, duplicate mappings, conflicts, existing identity text,
  operator attribution, dry runs, and repeat runs.

The initial migration's normalized checksum is pinned. Its contents must not be
rewritten to make a deployed database appear current.

CI also runs `npm run test:migrations -- --native` against a dedicated PostgreSQL
17 service. Native mode requires an explicit loopback database named
neu_arrs_migration_test and CREATE DATABASE permission. Each scenario creates and
removes only its own random test database, leaving the supplied database intact.
It additionally exercises Prisma's failed-migration recovery/history commands.
CI separately deploys to the service database, rejects drift, and runs the actual
Prisma client. The local embedded protocol does not validate native multi-session
locking or provider infrastructure; staging verification remains necessary.

## Operator connection

The operator scripts require **MIGRATION_DATABASE_URL** from the environment.
They deliberately do not fall back to DATABASE_URL or load application env files.
Use a direct PostgreSQL migration connection with appropriate DDL permissions,
and verify the target before running any write command. Keep verified mapping
files and credentials outside the repository.

```sh
npm run db:status
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code --config prisma.migration.config.ts
```

The diff is read-only: exit 0 means schemas match, 2 means drift, and 1 means the
check failed. `migrate deploy` itself does not detect general schema drift.
Classify the database before choosing a procedure below. No live database was
inspected or changed while preparing this batch.

## Empty database

```sh
npm run db:migrate
```

All pending migrations apply. An empty Request table needs no identity backfill.
The later [checkout batch](06-checkout-idempotency.md) adds a fourth, additive
migration after the three migrations described here.

## Populated database matching the original migration

1. Back up and rehearse on a restored staging clone. Pause writes and keep the
   application offline through expansion/backfill/contraction: the intermediate
   nullable fields are not compatible with the current required-field client.
2. Confirm the original migration is recorded and its schema matches the target.
   If the schema exists without migration history, baseline only that original
   migration with `prisma migrate resolve --applied 20260608114857_init --config
   prisma.migration.config.ts`, after confirming equivalence. Do not reset data.
3. Run `npm run db:migrate`. Expansion commits. If legacy rows lack identity, the
   contract migration deliberately fails with **Verified student identity backfill
   required** and rolls back its own transaction. This pause is expected; none
   of the contract's status conversions or constraints have committed.
4. Obtain an authoritative verified mapping. The old schema contains neither
   names nor student numbers; a Clerk ID or account display name cannot establish
   an academic identity. Supply JSON containing only these fields, for example:

   ```json
   [
     {
       "studentId": "user_REPLACE_WITH_VERIFIED_CLERK_ID",
       "studentName": "Replace with verified roster name",
       "studentNumber": "22-12345-123"
     }
   ]
   ```

   Example values are illustrative, not a roster. Cover every student with a
   request missing identity. Existing nonblank fields must agree with the mapping
   and are preserved exactly; conflicts stop the whole backfill before writes.
5. Preview and apply the mapping:

   ```sh
   npm run db:backfill-identities -- --file /secure/verified-identities.json
   npm run db:backfill-identities -- --file /secure/verified-identities.json --apply --actor YOUR_OPERATOR_ID
   ```

   The default preview rolls back and reports only counts. Apply runs in one
   transaction, updates missing identity fields, and adds per-request audit
   records with operator/source/previous updatedAt. No payment fields are changed.
   A successful repeat run reports zero pending requests.
6. Only for the verified identity-guard failure described above, mark that rolled
   back contract attempt as rolled back, then resume:

   ```sh
   npx prisma migrate resolve --rolled-back 20261111000200_contract_request_schema --config prisma.migration.config.ts
   npm run db:migrate
   ```

   Do not blindly resolve lock/permission/unknown failures. Inspect the failure
   and actual schema before choosing recovery. A failed contract remains recorded
   in Prisma history until explicitly resolved.
7. Require `db:status` success, zero read-only schema diff, and staging application
   checks before deploying/resuming service. Test student requests, staff updates,
   payment webhook receipts, and refunds using test-mode provider credentials.

## Database already matching the current schema

A database changed through db push/manual DDL may already have the tables, enum
values, and required fields. **Do not replay the expansion SQL over it.** These
migrations intentionally fail on unexplained pre-existing objects rather than
silently masking partial drift.

After backup/staging rehearsal, verify zero schema diff, no obsolete PENDING
values, verified identities, preserved financial values, and migration history.
Only when the migration effects are demonstrably already present may an operator
mark the corresponding missing migrations applied:

```sh
npx prisma migrate resolve --applied 20261111000100_expand_request_schema --config prisma.migration.config.ts
npx prisma migrate resolve --applied 20261111000200_contract_request_schema --config prisma.migration.config.ts
```

If the original migration is also unrecorded, baseline it only after verifying
the whole history/state. Resolve commands record history; they do not execute
DDL or repair missing data. A zero schema diff alone does not validate identity
or financial data. Partial/unexplained drift requires an inspected reconciliation
plan on a clone, not blanket applied markers, IF NOT EXISTS changes, or resets.

## Locking and limits

Both new migrations have explicit transactions, 5-second lock timeouts, and
60-second statement timeouts. Text/enum conversions can rewrite and exclusively
lock Request; NOT NULL checks scan legacy rows. Schedule a maintenance window and
measure large-data upgrades on a clone. Timeouts fail rather than leave partial
DDL; a large installation may need a reviewed staged plan before deployment.

Operator commands are prepared for review; running them against production is a
separate deployment action. The application data model is otherwise unchanged.

## Version-specific references

This repository uses Prisma 7.8. Its SQL migration workflow differs from newer
Prisma releases; use the installed CLI and Prisma v7 documentation:

- https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations
- https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining
- https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production
- https://www.postgresql.org/docs/current/sql-altertype.html
