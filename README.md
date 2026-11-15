# NEU-ARRS

Academic document requests, registrar processing, and campus pickup, built with
Next.js, Clerk, Prisma/Neon, and PayMongo.

## Current source and documentation

[spec.md](spec.md) defines the current architecture, three roles, workflow,
identity/payment gates, monetary evidence and API contracts.
[tasks.md](tasks.md) separates completed local work from pending release and
operational acceptance. Numbered [remediation reports](docs/remediation/) retain
their dated implementation/validation history; their older counts and contract
versions are historical. The current source includes S6/P8/A2/Q2/D2 follow-ups
beyond batches 1-20 and has not yet completed its coordinated production rollout.

Important current contracts:

- Clerk `src/proxy.ts` routing plus live server authorization on actions/reads;
  roles are student, employee and admin. Registrar review gates fulfillment.
- Thin Server Actions call private services; read DTOs separate `documentTypeId`
  from `documentLabel` and transport dates as ISO strings.
- Student/queue/finance/movement JSON formats are `history-v3`, `queue-v3`,
  `finance-v3`, and `money-movements-v2`. Release their clients and APIs together.
- `/admin/finance` reports settled request values by submission date.
  `/admin/finance/movements` reports evidenced collection/refund dates, with
  unknown dates explicitly unallocated. Both use Manila calendar boundaries.
- Only canonical evidence-backed PHP-centavo amounts enter financial totals.
  Historical mixed-unit `amountPaid` is preserved without automatic conversion.

## Getting started

Use Node.js 24 and npm 11.19.1 or newer; `packageManager` declares the baseline.
Run `npm ci` to install the lockfile and generate Prisma. Installs enforce peer
compatibility and reviewed dependency install scripts. Default Prisma generation
and validation do not load application env files or select a runtime database.

With intended isolated application services configured, run `npm run dev` and
open [localhost:3000](http://localhost:3000). Routes live under `src/app/`.
Application runtime uses `DATABASE_URL`; operator migrations deliberately require
separate explicit `MIGRATION_DATABASE_URL`. Keep secrets out of committed files.
Read the relevant installed `node_modules/next/dist/docs/` guide before changing
Next.js code, as required by [AGENTS.md](AGENTS.md).

### Payment environment configuration

Online payment services require explicit server-only environment settings:

| Application | `PAYMONGO_NAMESPACE` | `PAYMONGO_ACCEPT_LEGACY` |
| --- | --- | --- |
| Original NEU-ARRS | `neu-arrs` | `true` while unmarked historical sessions exist |
| Isolated demo | `neu-arrs-demo` | `false` |

Both settings are required. Missing/malformed values fail closed; only
`neu-arrs` may enable legacy compatibility. New checkout metadata is tagged by
the server. Authenticated foreign-namespace events are acknowledged before
database access; owned events retain their full payment/correlation checks.
Frozen checkout attempts are never retagged or resubmitted under another
namespace. Provider retrieval, expiry, refund and reconciliation enforce the
same boundary. Each endpoint needs its own webhook signing secret.

This is application-side separation within a shared merchant account, and
depends on correct per-project configuration. `VERCEL_ENV` cannot distinguish
the original project from a demo also using a Production target. The live
receiver must have its reviewed guard and configuration before any shared-
merchant test checkout is generated. See the
[namespace implementation and rollout plan](docs/remediation/28-paymongo-namespace-isolation.md).
Local implementation is not deployment or provider acceptance.

## Local verification and CI

| Command | Checks |
| --- | --- |
| `npm run typecheck` | Generate Next.js route types, then run TypeScript |
| `npm run lint` | ESLint, including action/service import restrictions |
| `npm test` | Unit/disposable database integration tests; at most two workers |
| `npm run test:watch` | Interactive Vitest watch mode |
| `npm run check` | Type checking, lint, and Vitest |
| `npm run audit:security` | Audit the complete lockfile, including development dependencies |
| `npm run test:migrations` | Fresh/populated legacy upgrades in owned disposable databases |
| `npm run test:navigation` | Synthetic browser/component regression using installed Chrome |
| `npm run build:check` | Production build with an owned database and synthetic provider keys |
| `npm run verify` | Quality/security/migration/browser checks, isolated build and cron HTTP smoke |

On PowerShell, use `npm.cmd` if the execution policy blocks `npm.ps1`.
Complete verification needs Google Chrome and network access for npm audit and
uncached build fonts. Test/migration/build fixtures do not use or migrate the
application datasource. Browser fixtures use synthetic auth, data and actions;
they do not prove live Clerk/PayMongo/Resend acceptance. Current full browser
coverage includes both reports, CSV/PNG downloads and mobile navigation.

`npm run build:check -- --smoke-cron` starts owned loopback production servers
and checks cron authorization, empty runs, lease release and missing-secret
rejection, plus signed webhook namespace isolation in both directions with
unchanged financial/audit tables. Resulting `.next` output contains synthetic verification settings;
never deploy it. A release needs a normal build with the intended environment.

CI repeats checks in independent jobs, including native PostgreSQL 17 migration
verification and an installed Chrome channel. It publishes synthetic browser
diagnostics on failure. Require **CI required checks** in branch protection.
See [tooling/CI](docs/remediation/19-tooling-ci.md) and
[dependency security](docs/remediation/05-dependency-security.md) for install
policy, action pins, overrides and ongoing lifecycle maintenance.

## Database upgrades and release

There are 13 prepared forward migrations. Earlier hosted recovery verified the
first 11; S6 identity review and P8 financial dates remain pending application-
database rollout. Do not rewrite applied migrations or deploy consumers before
their required tables/guards exist.

1. Review [tasks.md](tasks.md), the [migration procedure](docs/remediation/04-migration-alignment.md),
   [S6 rollout](docs/remediation/21-student-identity-verification.md),
   [P8 rollout](docs/remediation/22-finance-reporting-requirements.md) and
   [DTO rollout](docs/remediation/23-service-boundaries-dtos.md).
2. Verify the intended target, back up and rehearse the upgrade. Operator commands
   `npm run db:status` and `npm run db:migrate` require explicit
   `MIGRATION_DATABASE_URL` through `prisma.migration.config.ts`. Do not infer a
   target from runtime env files. Legacy identity gaps stop the contract migration.
3. Apply approved migrations before releasing matching clients/APIs/actions;
   build with the intended environment and reload existing tabs afterward.
4. Complete current remote CI and live registrar/provider/report acceptance.
   Track unavailable operational checks as pending or explicitly deferred.

`npm run db:backfill-identities` supports the legacy schema upgrade, not registrar
attestation. Historical money recovery uses the dry-run-first
`npm run db:reconcile-money -- --file <verified-evidence.json>` with explicit
migration datasource. Read [verified-money evidence requirements](docs/remediation/15-verified-money.md)
before applying a reviewed manifest. No migration invents historical amounts,
transaction dates or registrar identity verification.

Automatic Preview deployments remain contained until isolated resources and
credentials are ready. Preserve Production scopes/values; never provision
previews from shared production credentials or deploy the synthetic build output.
This documentation is guidance, not authorization to commit, migrate or deploy.

## Recovery and scheduled jobs

Administrators can use **Reconcile payment** on cancelled online requests with
a reason. It verifies payment/refund records and closes unpaid sessions without
submitting another refund. Read [checkout recovery](docs/remediation/06-checkout-idempotency.md)
and [cancellation reconciliation](docs/remediation/08-manual-cancellation-reconciliation.md)
before handling uncertain outcomes or legacy sessions.

Daily schedules in `vercel.json` preserve the selected plan compatibility.
Configure a strong `CRON_SECRET`. Cleanup considers unpaid online requests older
than three days with leases and payment/expiry proof. Never call production
cleanup as a connectivity test: an authorized GET performs real expiration and
audited cancellations. See [cleanup safety](docs/remediation/07-cron-cleanup-safety.md).

Status changes commit durable notification intents, followed by an immediate
send attempt and daily fallback. Configure `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`CLERK_SECRET_KEY`, HTTPS `NEXT_PUBLIC_APP_URL` and `CRON_SECRET` for the intended
deployment. Uncertain sends beyond 23 hours require review; preserve original
frozen payloads/idempotency keys. Provider acceptance is not inbox delivery.
The restricted Resend test sender does not establish general-recipient readiness.
See [notification recovery](docs/remediation/09-durable-notifications.md).

## Remediation history

Historical reports describe each increment at its recorded point in time. Current
contract versions and pending release status are in the specification/checklist.

- [Navigation](docs/remediation/10-navigation-state.md),
  [student state](docs/remediation/11-student-request-state.md),
  [history pagination](docs/remediation/12-student-history-pagination.md),
  [staff queue](docs/remediation/13-admin-queue-refactoring.md).
- [Submission-date finance](docs/remediation/14-finance-reporting.md),
  [verified money](docs/remediation/15-verified-money.md),
  [student directory](docs/remediation/16-student-directory.md),
  [configuration](docs/remediation/17-document-settings-validation.md),
  [role/session recovery](docs/remediation/18-authentication-role-session.md).
- [Batch 20 cleanup/performance](docs/remediation/20-final-cleanup-performance.md),
  [S6 identity review](docs/remediation/21-student-identity-verification.md),
  [P8 transaction dates](docs/remediation/22-finance-reporting-requirements.md),
  [A2/Q2 services and DTOs](docs/remediation/23-service-boundaries-dtos.md),
  [D2 documentation cleanup](docs/remediation/24-documentation-compatibility-cleanup.md).
