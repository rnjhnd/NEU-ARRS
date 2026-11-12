# Dependency security updates (fifth remediation batch)

## Result and scope

On November 11, 2026, the complete npm audit changed from 33 reported vulnerable
package entries (1 critical, 15 high, 13 moderate, 4 low) to zero. A production-only
audit also reports zero. These are registry advisory results for this lockfile,
not a replacement for the application security review.

The package graph was updated without forcing incompatible major versions of
Next.js, React, Prisma, Vitest, or ESLint. Application behavior and database
migrations were not changed in this batch. No deployment, live datasource
operation, or provider account operation was performed.

## Version choices

| Package | Previous installed version | Updated version |
| --- | --- | --- |
| Next.js / eslint-config-next | 16.2.7 | 16.4.6 |
| React / React DOM | 19.2.4 | 19.2.9 |
| Prisma CLI / client / PostgreSQL adapter | 7.8.0 | 7.10.1 |
| Zod | 4.4.3 | 4.6.7 |
| React Email renderer | 2.0.8; components nested 2.0.6 | 2.3.1 throughout |
| Vitest | 4.1.8 | 4.1.12 |
| ESLint | 9.39.4 | 9.39.5 |
| Node types | 20.19.42 | 24.19.2 |

Updated direct packages are pinned exactly. The lockfile also incorporates
compatible fixes to vulnerable transitive dependencies, including the Next.js
toolchain, Prisma development tooling, Vite, and ESLint's dependency graph.

Next.js 16.4.6 is the stable release following the
[16.4.5 security update](https://github.com/vercel/next.js/releases/tag/v16.4.5).
See the primary release notes for [Next.js 16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6),
[Prisma 7.10.1](https://github.com/prisma/orm/releases/tag/7.10.1),
[Zod 4.6.7](https://github.com/colinhacks/zod/releases/tag/v4.6.7), and
[Vitest 4.1.12](https://github.com/vitest-dev/vitest/releases/tag/v4.1.12).
Version-matched upgrade, environment, font, and TypeScript guidance was read in
`node_modules/next/dist/docs/` before validating the upgrade.

Node 24 is declared in `engines`, `.nvmrc`, and every CI job, replacing CI's Node
20. This aligns the runtime and Node types with a supported release line; consult
the [Node.js release schedule](https://nodejs.org/en/about/previous-releases).
Deployment runtime settings must match when this batch is eventually deployed.

## Scoped dependency overrides

`package.json` contains two temporary parent-specific overrides:

- `@react-email/components` resolves `@react-email/render` to the direct renderer
  version. Otherwise its exact nested 2.0.6 pin keeps the old html-to-text and
  vulnerable deepmerge chain installed even after the direct renderer is updated.
  Renderer 2.3.1 removes this chain. Both renderer entry points, the existing
  Tailwind template, plain-text conversion, and escaping of hostile field values
  are covered by compatibility tests. The
  [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) has no
  patched 4.x version, so eliminating the dependency is necessary.
- `@typescript-eslint/typescript-estree` resolves minimatch to 11.0.7. Its declared
  10.x range still falls within the
  [affected versions](https://github.com/advisories/GHSA-g3hv-75wg-m249).
  This crosses minimatch's major version only for that parser, leaving ESLint's
  unrelated 3.x consumers intact. Tests check the parser's actual named matcher
  API and initialize its real project service with a default-project allowlist.
  Full repository linting also confirms that the toolchain loads successfully.

Remove each override once its parent declares a fixed, compatible dependency;
rerun the compatibility tests, complete audit, and build before doing so. No
global replacement of all minimatch versions or unsupported ESLint peer override
was used.

## Reproducible verification

After updating the lockfile, a clean `npm ci --ignore-scripts` succeeded. Prisma
generation was then run explicitly with `scripts/prisma-test.config.ts`, which
does not load application env files or connect to the application datasource.
`npm ls` reports a valid dependency graph, including both scoped overrides.

Checks completed locally on Node 24.22.0 / npm 11.19.1:

- Full and production-only `npm audit --audit-level=low`: zero findings.
- `vitest run`: 177 tests across eight files passed, including four new
  compatibility and email escaping tests.
- `tsc --noEmit` and Prisma schema validation passed.
- All three disposable migration scenarios passed with the updated generated
  Prisma client: deploy/redeploy, drift, CRUD, legacy upgrades, and backfills.
- Focused ESLint checks passed for the new tests and build checker.
- `npm run build:check` passed using the default Next.js 16.4.6 Turbopack build,
  including TypeScript checking, page-data collection, static generation, and
  route output.

`scripts/check-build.mjs` creates its own in-memory PostgreSQL instance, applies
the repository migrations there, and overrides the application datasource and
provider settings with disposable/synthetic values before spawning `next build`.
Environment overrides take precedence over dotenv files. The process closes the
database afterward. Its `.next` output is **verification-only** and must be
rebuilt with the intended deployment configuration before publishing. Google
font downloads still require network access.

CI has an independent dependency-security job that runs `npm run audit:security`
and fails on any advisory severity, including development dependencies. No audit
exceptions or disabled lint rules were added. Remote CI and the native
PostgreSQL service job were configured but not executed from this workspace.

## Remaining maintenance work

**Follow-up:** [batch 19](19-tooling-ci.md) repairs the strict-install lockfile,
enables peer/install-script enforcement, makes module loading explicit, and adds
complete CI/browser checks. Batch 18 cleared the application lint errors. The
ESLint-9 lifecycle and deprecated email-component issues below remain separate
maintenance concerns; the historical lint/module warnings are no longer current.

- Full application lint currently reports 55 errors and 30 warnings in existing
  files (hook patterns, explicit any, static component definitions, refs, and
  related quality issues). This batch does not edit those components. The normal
  lint CI step remains enabled and failing until that separate cleanup is done.
- ESLint 9 is [end of life](https://eslint.org/version-support/). Version 9.39.5
  is retained because the installed current React/import plugins declare ESLint
  peers only through 9. Migrating the lint stack to a supported release requires
  a separate compatibility change; zero advisories does not resolve this lifecycle
  concern.
- npm marks the installed React Email components and their individual component
  packages deprecated. The renderer update clears their reported vulnerability
  chain, but migration to the maintained email component API remains separate
  maintenance work.
- Next.js warns that `middleware.ts` should migrate to `proxy.ts`. The existing
  middleware still builds; authentication/rate-limit behavior needs dedicated
  verification during that migration.
  **Follow-up:** completed with service-auth and user-route tests in
  [batch 7](07-cron-cleanup-safety.md).
- Vite warns about the current CommonJS loading of `vitest.config.ts` ahead of a
  future loader default. A configuration migration is deferred; no warning was
  suppressed.

The next recommended application batch is checkout creation/retry idempotency
and payment-order integrity. Durable notifications/refunds, canonical monetary
storage, cron authentication, and broader UI refactoring remain separate items.

Follow-up: [batch 20](20-final-cleanup-performance.md) closes the deprecated
email-component follow-up using native markup and the maintained renderer; it
also removes unused direct dependencies. Strict clean installation and a full
audit pass with zero advisories. ESLint lifecycle support remains open as noted
in batches 19 and 20.
