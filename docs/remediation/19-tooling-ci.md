# Batch 19: Tooling and CI reliability

Implemented locally on 2026-11-12, preserving all uncommitted batch-18 changes.
The last commit remains the batch-17 checkpoint `6b03841`. This batch changes
tooling/configuration and documentation; it adds no application feature, migration,
provider operation, scheduled job, deployment, or Git commit.

## 1. Codebase architecture and design

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | `package.json`, `vitest.config.ts`, native migration smoke imports | ESM source was loaded through implicit CommonJS/package inference, producing Vitest/Vite and Node warnings. The private package now explicitly uses ESM, and Vitest resolves its root/alias through `import.meta.url`. Application imports, native migration imports, and Next configuration are validated together; no warning filter or unsupported loader workaround is used. |
| Medium | `package.json`, `.github/workflows/main.yml` | Developers and CI used separate ad hoc commands; CI omitted all component browser checks. Shared `typecheck`, `test`, `check`, and `verify` scripts now define repeatable entry points. Independent audit, quality, Chrome, migration, and build jobs feed one aggregate required-check status. |
| Medium | `prisma.config.ts` | Even generation/default CLI commands loaded `.env.local` and selected `DATABASE_URL`. The default config is generation/validation-only, with no datasource or dotenv read. Operator migration commands retain their explicit `prisma.migration.config.ts` and `MIGRATION_DATABASE_URL`; test commands retain owned/disposable datasources. |
| Medium | `next.config.ts` | A nested clean install inherited the outer repository's inferred build root because both had lockfiles. Turbopack now uses the absolute directory containing its own config. The standalone application resolves inside its own source/dependency tree, and the corrected production build is verified separately. |

The installed Next.js guide supports ESM `next.config.ts` on the project's Node 24
runtime. No framework/configuration file rename or application-wide import rewrite
is required. Native Node migration smoke imports now resolve without reparsing the
notification module as an ambiguous package.

## 2. Code quality and refactoring

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | `.npmrc`, `package-lock.json` | `legacy-peer-deps=true` bypassed peer checks. A strict clean install failed because peer entries were missing from the lockfile. Peer bypass is disabled, strict checking is enabled, and eight missing peer/optional lock entries are restored. No existing locked version, integrity, or scoped compatibility override is replaced. |
| Medium | `package.json`, `.npmrc` | npm reported dependency lifecycle scripts without an explicit policy. The project now requires npm 11.19.1 or newer, declares the tested npm baseline, and fails installs with unreviewed scripts. Four reviewed script approvals are pinned to exact locked versions, including the optional macOS watcher; Clerk's install-time telemetry-notice script is explicitly denied. |
| Medium | `vitest.config.ts`, `package.json` | Default Vitest concurrency could overcommit CPU/memory while several disposable databases initialized. All entry points now default to at most two workers. Source/script-test globs exclude scratch clones; focused tests are prohibited in CI. `npm test` runs once and `test:watch` explicitly opts into watch mode. |
| Low | README, TypeScript/ESLint configuration | Setup documentation advertised unrelated package managers and the wrong app path; generated reports/scratch code could enter lint/type discovery. Documentation now uses the npm lockfile and actual commands. Only generated reports, coverage, and scratch work are excluded; application code and test fixtures remain checked. |

### Install-script policy

| Package | Policy | Reviewed purpose |
| --- | --- | --- |
| `prisma@7.10.1` | Allow exact version | Supported Node-version preinstall check |
| `@prisma/engines@7.10.1` | Allow exact version | Prepare/download Prisma's platform engines |
| `fsevents@2.3.3` | Allow exact version | Optional macOS watcher native build; manifest and `binding.gyp` reviewed, not executed on Windows |
| `unrs-resolver@1.12.2` | Allow exact version | Prepare the platform native resolver |
| `@clerk/shared` | Deny | Install-time telemetry notice and home-directory notice marker; unnecessary to build/run the application |

The Clerk denial does not configure or claim to disable SDK runtime telemetry.
The application's own `postinstall` still generates Prisma. No blanket lifecycle
approval or global npm/user-configuration change was made.

After a dependency update, inspect `npm install-scripts ls`, review each changed
script, and approve only the reviewed package/version with
`npm install-scripts approve <package>`. Do not bypass the policy with a blanket
allow option. npm documents pinned approvals and explicit denials in its
[install-script reference](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/).

## 3. Security vulnerabilities and dependency configuration

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | Workflow action references and checkout configuration | Mutable action tags and persisted checkout credentials increased the scope of build-time dependency trust. Checkout, setup-node, and upload-artifact now use reviewed full commit SHAs with Node-24 runtimes; every checkout disables credential persistence. The workflow explicitly grants only `contents: read` and uses no application secrets. |
| Medium | `.npmrc`, install-script approvals, lockfile | Suppressed peers and unreviewed lifecycle scripts weakened install reproducibility and made new scripts easy to miss. Strict peer/script policies and the repaired lockfile now fail the install on incompatible peers or new unreviewed scripts. A clean isolated install and generated client were verified. |
| Medium — open lifecycle limitation | ESLint 9.39.5 and plugins from `eslint-config-next` | ESLint 9 is EOL. ESLint 10.14.0 is current, but the latest React 7.37.5, import 2.32.0, and accessibility 6.10.2 plugin manifests still declare peers only through ESLint 9. Retain the valid lint graph while tracking upstream compatibility, then migrate with rule-equivalence and peer checks. Do not force peer overrides or silently remove these rule sets. |
| Medium — remaining cleanup | Deprecated React Email component packages | The existing component packages still produce npm deprecation notices. Their API migration is application/email work, reserved for the final cleanup review. A zero-advisory audit does not imply lifecycle support. |

[ESLint's support table](https://eslint.org/version-support/) confirms the EOL
status. Compatibility was checked against the current publisher manifests:
[React](https://registry.npmjs.org/eslint-plugin-react/7.37.5),
[import](https://registry.npmjs.org/eslint-plugin-import/2.32.0), and
[accessibility](https://registry.npmjs.org/eslint-plugin-jsx-a11y/6.10.2).

### Reviewed GitHub action revisions

| Action | Reviewed release | Commit |
| --- | --- | --- |
| Checkout | [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| Setup Node | [v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| Upload artifact | [v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |

Release tags were resolved through the official repository API; each pinned
`action.yml` was checked for the inputs used and its Node-24 runtime. Update pins
through reviewed changes. Read-only token scope and immutable action revisions
follow [GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).

## 4. Dead code and unused configuration

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Low | Vitest config, default Prisma config | Removed the CommonJS-only `__dirname` assumption, duplicated test alias nesting, default dotenv load, and implicit application datasource selection. Existing explicit operator/test configs remain in use. |
| Low | Workflow and README | Removed duplicated Prisma generation after `npm ci` and the starter setup/package-manager instructions. Existing fixtures, acceptance tests, and operator scripts were retained. No speculative source/asset deletion was performed. |

## 5. Performance and reliability weaknesses

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | CI browser coverage and aggregate job | UI regressions could pass the former workflow because no browser job ran. A Chrome job now installs its browser/system dependencies and executes all 107 isolated checks. The aggregate job fails if any prerequisite fails, is skipped, or is cancelled. Require `CI required checks` in branch protection to enforce it. |
| Medium | CI jobs | Builds previously depended on successful migration-job steps. Audit, quality, browser, migrations, and build now run independently, with bounded job durations and cancellation of superseded runs. Failures preserve a clear status for each responsibility. |
| Medium | `typecheck` script | Bare `tsc` on a fresh checkout lacked generated Next route definitions. `next typegen` now runs before TypeScript, using the supported installed Next CLI. A clean source copy with no `.next` or `next-env.d.ts` successfully exercised this path. |
| Low | Shared browser fixture server | Every fixture used the same Vite optimizer cache despite different roots/aliases, triggering repeated cache replacement. Each allowlisted fixture now has its own cache subdirectory. Test behavior, one-worker Chrome execution, and zero retries are preserved. |

CI keeps HTML reports, traces, and screenshots only after failure, for seven days.
These jobs use synthetic data/actions and block unrelated outbound browser traffic;
no real authentication storage or application `.env` files are uploaded. Browser
setup follows [Playwright's CI guide](https://playwright.dev/docs/ci).

### Local verification

Verification used an owned, ignored `scratch` copy of the current source/configs,
the repaired lockfile, and newly installed dependencies. Application env files,
Git metadata, existing generated route types, and the original `node_modules`
were not copied. A temporary synthetic env sentinel was used solely to confirm
the default Prisma config does not load it, then removed before full verification.

- Strict `npm ci`, automatic Prisma generation, and `npm ls --all` passed.
  `npm install-scripts ls --json` reports no pending approvals under the final policy.
  Eight lock entries were added; no existing locked version was changed.
- `npm run verify` passed with CI mode enabled: **722 tests in 38 files**, full
  ESLint with zero errors/warnings, Next route generation/TypeScript, a complete
  dependency audit with zero findings, all four disposable migration scenarios
  with zero Prisma drift, **107 Chrome checks**, production build, and loopback
  cron HTTP checks.
- The prior Vitest/Vite config-loader and native Node module-reparsing warnings
  are absent. npm's ESLint/React Email deprecation notices remain visible.
- A negative default-CLI check rejects migration status without an explicit
  datasource even when ambient `DATABASE_URL` is supplied a synthetic value.
- Removing a reviewed script approval only in the owned scratch copy makes
  `npm rebuild prisma` fail with `ESTRICTALLOWSCRIPTS`; the approved manifest is
  restored afterward. This confirms unreviewed scripts fail the actual npm command.
- The workflow passes **actionlint 1.7.12**. Its official Windows release archive
  was verified against the published SHA-256 before local use. No validation tool
  or its archive was added to application dependencies or committed files.
- Diff whitespace/conflict and changed-file secret-pattern checks passed.

### Limits and remaining work

- Remote GitHub jobs and the native PostgreSQL service job were not executed from
  this workspace. No local Docker/Postgres CLI tooling was found. The native
  replay, actual-client smoke, and drift steps remain configured in CI.
- Branch protection and Vercel Deployment Checks require repository/platform
  configuration; no remote settings were changed. Merely adding a workflow does
  not establish a release gate by itself.
- The ESLint lifecycle limitation and deprecated email components remain open as
  described above. No unsupported peer override, runtime dependency upgrade, or
  warning suppression was introduced to conceal them.
- Batch 18's role-recovery migration and live-provider/deployment verification
  remain release prerequisites. Batch 19 adds no migration. Verification-only
  `.next` output must be rebuilt with intended deployment configuration.

### Files changed in this batch

`.github/workflows/main.yml`, `.npmrc`, `package.json`, `package-lock.json`,
`vitest.config.ts`, `playwright.navigation.config.ts`, `prisma.config.ts`,
`next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `scripts/navigation-fixture/server.mjs`,
README, batch-5 and batch-18 follow-up links, and this report. Existing batch-18
application/schema/migration changes remain intact and uncommitted.

The local tooling/CI implementation and verification criteria are satisfied,
subject to the explicit upstream lifecycle and remote-run limitations above.
Continue with **batch 20: final cleanup and performance review**. No commit, push,
merge, deployment, application database access, or real provider operation occurred.

Follow-up: [batch 20](20-final-cleanup-performance.md) removes the deprecated
email components in favor of native React email markup and the maintained
standalone renderer. Its clean install removes 24 lock entries without changing
remaining versions. ESLint lifecycle support and remote CI/release checks remain
open; the counts above preserve batch 19's original verification baseline.
