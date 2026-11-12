# NEU-ARRS

Academic document requests, registrar processing, and campus pickup, built with
Next.js, Clerk, Prisma/Neon, and PayMongo.

## Getting started

Use Node.js 24 and npm 11.19.1 or newer; the repository declares its npm baseline
in `packageManager`. Run `npm ci` to install the lockfile and generate Prisma.
Installs enforce peer compatibility and reviewed dependency install scripts.
The default Prisma configuration does not load application env files or select a
runtime database. Database operator commands use their explicit migration config.

With the intended application services configured, run `npm run dev` and open
[localhost:3000](http://localhost:3000). Application routes live under `src/app/`.

## Local verification and CI

| Command | Checks |
| --- | --- |
| `npm run typecheck` | Generate Next.js route types, then run TypeScript |
| `npm test` | Unit and disposable database integration tests, at most two workers |
| `npm run test:watch` | Interactive Vitest watch mode |
| `npm run check` | Type checking, lint, and Vitest |
| `npm run verify` | Quality checks, security audit, disposable migrations, Chrome regression, production build and cron HTTP smoke |

The complete verification command needs Google Chrome and network access for the
npm audit and any uncached build fonts. Checks use synthetic providers and owned
databases; the command does not migrate or connect to the application's database.
CI repeats these checks in independent jobs, including native PostgreSQL 17 and
an installed Chrome channel, and publishes synthetic browser diagnostics on failure.
Require **CI required checks** in GitHub branch protection to enforce every job.
See [batch 19](docs/remediation/19-tooling-ci.md) for install-script review, action
pins, module configuration, and remaining dependency lifecycle limitations.

## Dependency and build checks

Run `npm run audit:security` to audit the complete lockfile, including development
dependencies. CI runs the same check independently of application linting.

Run `npm run build:check` to verify the production build using an owned in-memory
database and synthetic provider keys. It never uses the application's database.
The resulting `.next` output contains verification settings: run a normal
`npm run build` with the intended environment before any deployment.

See the [dependency security remediation notes](docs/remediation/05-dependency-security.md)
for version choices, scoped overrides, validation, and remaining maintenance work.

`npm run build:check -- --smoke-cron` also starts an owned loopback production
server and verifies cron authorization, empty runs, real job lease release, and
missing-secret rejection. All keys are synthetic and the database is disposable.

## Database migrations

Run `npm run test:migrations` to verify fresh and populated legacy databases in
disposable local PostgreSQL instances. The tests do not load application `.env`
files or use the application's datasource.

Operator commands (`npm run db:status`, `npm run db:migrate`, and
`npm run db:backfill-identities`) require an explicitly supplied
`MIGRATION_DATABASE_URL`. Read the [migration upgrade procedure](docs/remediation/04-migration-alignment.md)
before applying migrations to any existing database. Legacy requests require
verified student identities; missing identities stop the contract migration.

The checkout batch adds a fourth, additive migration. Read the
[checkout upgrade and reconciliation notes](docs/remediation/06-checkout-idempotency.md)
before releasing the updated request actions. Existing unconfirmed sessions need
reconciliation, and quotes are not invented for historical orders.

The [cron cleanup batch](docs/remediation/07-cron-cleanup-safety.md) adds a fifth
migration for job leases/cursors and the cleanup scan index. Configure a strong
`CRON_SECRET` for the deployment before enabling the scheduled job. Never invoke
cleanup against production as a connectivity test: an authorized GET performs
real session expiration and audited cancellations.

Administrators can open a cancelled online request's details and use
**Reconcile payment** with a reason. This verifies payment/refund records and
closes unpaid sessions; it never submits another refund. See the
[manual cancellation and reconciliation notes](docs/remediation/08-manual-cancellation-reconciliation.md)
before handling uncertain refunds or historical checkout references.

The [durable notification batch](docs/remediation/09-durable-notifications.md)
adds a sixth migration and an administrator recovery queue at
`/admin/notifications` (linked from settings). Existing notification intents
commit with status changes, then receive an immediate delivery attempt and a
daily cron fallback. Configure `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`CLERK_SECRET_KEY`, `NEXT_PUBLIC_APP_URL` (HTTPS), and `CRON_SECRET` before release.
Uncertain sends cannot be retried after 23 hours; read the recovery notes before
handling review items. Provider acceptance does not confirm inbox delivery.

The [shared navigation remediation](docs/remediation/10-navigation-state.md)
removes cached profile state, shares staff route rendering, and replaces the
mobile overlay with a modal dialog. Run `npm run test:navigation` with Google
Chrome installed to repeat the isolated browser checks. They use synthetic auth
and routing; read the notes for the limits of this component-level verification.

The [student request history remediation](docs/remediation/11-student-request-state.md)
adds validated account-scoped refreshes, stable sorting/pagination, live counts,
and cancellation/payment recovery guards.

The [server-side history pagination batch](docs/remediation/12-student-history-pagination.md)
returns ten rows per page with whole-history summary counts, adds a seventh
index-only migration, and reduces active-history polling to 30 seconds. Settled
histories refresh on focus, reconnect, or manual refresh. Older tabs must reload
after the API/dashboard upgrade. The unit suite also verifies the history loader against owned disposable
PostgreSQL instances. Read the rollout notes before release.

The [staff queue refactoring](docs/remediation/13-admin-queue-refactoring.md)
adds a shared authenticated read model, safer selection/version handling,
guarded status/payment-review dialogs, and escaped CSV exports. Staff tabs must
reload after the API/dashboard upgrade. [Batch 20](docs/remediation/20-final-cleanup-performance.md) completes staff
server pagination and adds a separate date-bounded CSV endpoint.

The [finance reporting remediation](docs/remediation/14-finance-reporting.md)
introduced submitted-date reports in Manila and consistent CSV/PNG exports. It
adds an eighth, index-only migration and limits reports to 5,000 requests; larger
reports must use a shorter period.

The [verified-money batch](docs/remediation/15-verified-money.md) adds a ninth,
additive migration for evidence-linked PHP-centavo collections and confirmed full
refunds. Finance, receipts, and listed-student values now use verified collections;
unknown history requires review. Legacy `amountPaid` is preserved and never
automatically converted. Finance is still a submitted-date cohort, not a net or
payment-date ledger. Apply the migration before releasing these consumers and
reload finance tabs. Historical recovery uses the dry-run-first
`npm run db:reconcile-money -- --file <verified-evidence.json>` command, with an
explicit `MIGRATION_DATABASE_URL`; read the evidence and apply requirements before
changing any real records. No historical backfill runs as part of migration.

The [student directory refactor](docs/remediation/16-student-directory.md)
replaces the first-100-account sample with a checked, bounded complete snapshot,
groups request totals in Postgres, and adds staff-scoped refresh/recovery. Search
and sorting cover the whole snapshot; table pages show ten students. Limits of
5,000 total Clerk accounts and 2 MB prevent silent truncation; larger registries
need a dedicated paged directory service. No new migration is added. Release the
directory API and client together and reload open staff directory tabs.

The [document/settings refactor](docs/remediation/17-document-settings-validation.md)
adds exact-centavo price validation, administrator-only versioned configuration
saves with audit records, read-only catalog loading, explicit standard-document
initialization, and recoverable drafts. Student reads expose only active catalog
fields and request-availability settings. Deploy the new configuration API/actions
and clients together, then reload open tabs. No new migration is needed. Role-change
concurrency and durable session revocation are addressed in
[batch 18](docs/remediation/18-authentication-role-session.md), which adds a required
role-recovery migration. Apply `20261112000100_role_change_recovery` before releasing
that batch. Fresh server session/role checks, managed-account access fences, durable
role recovery, and account-scoped student submissions now protect those flows.
Resume pending role work from Settings; the existing daily cron schedule is unchanged.

Run `npm run test:navigation` for 114 isolated Chrome checks: nine navigation,
twenty student history, twenty-three staff queue, thirteen finance, fifteen directory,
twenty configuration, and fourteen authentication/student-entry checks, all
using synthetic auth/data/action responses. Finance coverage includes actual
CSV/PNG downloads. No real financial operation is used by these checks.

The [final cleanup and performance review](docs/remediation/20-final-cleanup-performance.md)
removes deprecated email components and unused UI wrappers. Apply the eleventh
migration, `20261112000200_staff_queue_pagination`, before releasing the queue
API/client together, and reload staff tabs. CSV exports allow optional Manila
creation dates and reject results above 5,000 requests or 5 MB. Read the report
for indexing/locking considerations, validation, and outstanding release checks.
ESLint 9 lifecycle support remains an upstream toolchain follow-up.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
