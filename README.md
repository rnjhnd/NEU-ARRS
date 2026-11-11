This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Use Node.js 24 (`.nvmrc` and `package.json` match CI), then run `npm ci`.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

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
reload after the API/dashboard upgrade. Full staff server pagination remains a
separate performance follow-up.

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

Run `npm run test:navigation` for 73 isolated Chrome checks: nine navigation,
twenty student history, sixteen staff queue, thirteen finance, and fifteen directory checks, all
using synthetic auth/data/action responses. Finance coverage includes actual
CSV/PNG downloads. No real financial operation is used by these checks.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
