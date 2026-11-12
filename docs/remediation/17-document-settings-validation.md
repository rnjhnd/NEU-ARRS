# Batch 17: Document and settings validation/refactoring

Follow-up: [batch 18](18-authentication-role-session.md) implements the deferred
current-session verification, durable role operations/revocation, and student-entry
hardening. Its role-recovery migration is required before releasing that batch.

Implemented locally on 2026-11-12 after the batch-1–16 checkpoint `7949461`,
following [batch 16](16-student-directory.md). Document and operational-setting
reads/writes now share explicit schemas, administrator authorization, versioned
snapshots, transactional audit records, and recoverable forms. Earlier payment,
refund, quote, notification, directory, and daily-cron behavior is preserved.
No live database, account, provider, migration, or deployment was changed.

## 1. Codebase architecture and design

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | Old catalog actions in `src/app/actions/admin.actions.ts`; replacement `configuration.actions.ts`, `src/lib/configuration-data.ts` | Reading an empty catalog created four documents as a side effect, including from student pages/build-time loaders. Catalog readers are now authenticated and read-only. Administrators can explicitly confirm adding missing standard documents; existing codes, descriptions, prices, and availability are preserved. |
| Medium | `configuration-model.ts`, `configuration-data.ts`, `configuration-fetcher.ts`, `configuration-roles.ts` | Document/settings/role UI mixed provider objects, arbitrary JSON, local reductions, and mutation logic. Separate typed contracts, read loaders, action handlers, and small editors now define each boundary. The private `/api/admin/configuration?format=config-v1&area=documents|settings|roles` API supplies verified refreshes. |
| Medium | Document/settings clients, `src/components/admin-configuration-session.tsx` | Long components shared unrelated drafts and lacked account-safe refresh/error handling. A common administrator session boundary isolates data; document, setting, and role editors own their separate drafts and pending states. Settings and role initial reads run independently in parallel, so a provider failure does not invent an empty account list or erase valid operational settings. |
| Medium | `configuration-defaults.mjs`, `notification-content.ts`, configuration model | The settings UI displayed different defaults from the notification worker. Shared plain-text defaults now drive both. A small explicit ESM module also works in the native Node migration smoke tool, avoiding a Next/Vitest-only extensionless import. |

The student request form receives only active document display/price fields, not
administrator record IDs, versions, or complete configuration objects. Student
settings reads expose only request maintenance and payment availability after
authentication. Initial/full snapshots are administrator-only.

## 2. Code quality and refactoring

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | Old document write actions; replacement `pesoInputSchema` and document actions | `parseInt(price) * 100` truncated PHP 150.50 to 15000 centavos, while the client independently displayed a floating-point guess. String-based decimal parsing now produces exactly 15050. Signs, exponents, commas, empty/malformed input, excess decimals, and amounts beyond the PostgreSQL integer range are rejected. |
| Medium | `document-editor.tsx`, document client, `setting-editor.tsx`, settings client | Saves had no reliable exception/finally path, so rejected calls could leave controls stuck or optimistic values displayed. Pending refs prevent duplicate activation, inputs freeze while saving, and only authoritative returned records update the cache. Errors retain drafts. Unconfirmed saves permit only an identical frozen retry or a close-and-refresh path. |
| Medium | Document/settings actions and editors | Edits could overwrite newer administrator changes. Forms now carry observed versions; database updates compare those versions and advance timestamps monotonically. Refreshed snapshots mark open drafts stale without replacing their text. Matching already-applied values return the current record without another write/audit. |
| Medium | Settings model and editor | Arbitrary JSON, repeated defaults, and shared persisted/draft state made cancellation and repair unreliable. Four allowed setting keys have bounded typed schemas. Closing an unsaved editor discards its draft; malformed stored settings are explicitly flagged, with defaults shown only for a reviewed repair. |
| Low | Table/editor modules and imports | Search resets previously relied on effects, paging could become empty, and repeated animation/row markup obscured state handling. Event-driven resets and derived page clamping replace those effects. Labeled native controls, explicit save/close actions, and bounded scrollable dialogs replace unlabeled icon-only edits and duplicated inline forms. |

### Pricing, codes, and history

- Inputs are PHP decimal strings; persistence and action results use integer
  centavos. Zero is valid. Prices below PHP 1.00 remain cash-only under the
  existing online-checkout minimum. Maximum price: **PHP 21,474,836.47**.
- Names are trimmed/bounded to 200 characters and descriptions to 2,000.
  New optional document codes must use uppercase letters, numbers, and underscores,
  beginning with a letter. A missing code is derived from the name. Duplicate
  codes fail rather than silently selecting or overwriting another document.
- Existing document codes cannot be edited. Label, description, price, and
  availability changes do not rewrite existing request quotes, frozen checkout
  payloads, canonical money, or historical payment evidence.
- A new-document intent UUID is namespaced by the authenticated actor and hashed
  into a stable record ID. Replaying the same create returns its existing matching
  record. Reusing the intent for different data is rejected.
- Explicit standard-document initialization adds missing `TOR` (PHP 150),
  `GOOD_MORAL` (PHP 50), `DIPLOMA` (PHP 500), and `ENROLLMENT` (PHP 100).
  Repeating it is safe; it does not replace existing values. No read initializes
  them automatically.

## 3. Security vulnerabilities and integrity

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | Old `getSystemSetting`/`updateSystemSetting`; new readers/actions | The read action lacked authentication and accepted arbitrary keys; writes upserted arbitrary keys/strings. The compatibility reader now authenticates and permits only the two student-facing availability controls. Private loaders and every mutation independently require an administrator. Operational writes allow only four known keys and validate their shapes before IO. |
| High | `configuration.actions.ts` | Configuration edits lacked atomic audit evidence and stale-write protection. Document/setting changes now commit with audit records. Failed audits roll back the write. Document audits record before/after canonical fields; settings audits record actor, key, versions, repair status, and value hashes without duplicating message bodies. SQL/Prisma/provider errors are sanitized. |
| High | Session boundary, fetcher, clients | Cached configuration and account PII could survive an account/role change or expired session. Snapshot/cache keys include the actor; parsed snapshots must match it. HTTP 401/403/404/409 and redirected refreshes fail closed across the settings panels. The protected-route 404 case is covered because Clerk may return it before route-level guards run. Late action results cannot update another account's UI. |
| Medium | Form parsing and schemas | Type assertions did not validate files, duplicate fields, booleans, JSON keys, or sizes. Writers now reject malformed forms, duplicate/unknown fields, file-valued text, and unsupported keys. A null-prototype field map avoids special-property setters. Framework action metadata is excluded from application fields. |
| Medium | Role action/list/panel | Roles were trusted as TypeScript values; settings listed only 100 users and displayed optimistic role changes. Runtime role validation, bounded complete account paging, primary-email projection, observed-role checks, explicit confirmation, last-verified role labels, and refresh/review after uncertainty replace those paths. Unknown roles are marked for manual review. Self-demotion and observed-last-admin rejection remain. |
| High — batch 18 follow-up | `admin.actions.ts:updateUserRole` and session revocation | These changes do **not** make external role changes transactional. The read/count/write sequence can still race between administrators, and session revocation is not yet fully paginated/durable. Batch 18 must address serialized/durable role operations, authoritative actor/target checks, complete session revocation, audited outcomes, and reconciliation of unknown provider results. Do not treat this batch as completion of the authentication audit. |

Changing accounts does not cancel an already-authorized database/provider operation
in flight. It hides the workspace and ignores late results. Verify stored state on
reload after an uncertain outcome; closing an editor cannot undo a committed save.
No real role change or session revocation was executed during this batch.

### Allowed setting values

| Key | Validated value and meaning |
| --- | --- |
| `MAINTENANCE_MODE` | JSON boolean. Pauses new request/payment-setup entry points; existing request history remains available. It does not expire existing external checkout links. |
| `PAYMENT_METHODS` | Exactly `online` and `cash` booleans, with at least one enabled. |
| `OPERATIONS_CONFIG` | Nonempty pickup `location` and `hours`, each at most 500 characters; no additional fields. |
| `EMAIL_TEMPLATES` | Plain-text overrides only for the five current request statuses, including `CANCELLED`, at most 10,000 characters per message. Blank values remove that override and restore the shared default. Unknown statuses are rejected. |

Each serialized setting input is bounded to 60,000 UTF-8 bytes. Valid values are
parsed and re-encoded. Malformed legacy records are not silently rewritten.
Administrators must review and explicitly save a repair. New notification intents
capture the current message/pickup details; previously queued content stays frozen.
Existing email escaping and notification retry/recovery rules remain unchanged.

## 4. Dead code and unused paths

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| Medium | `admin.actions.ts` and old configuration clients | Read-time seeding, the unused public catalog action, arbitrary-setting upserts, duplicated document writers, local floating-point price guesses, and broad layout invalidation are removed. Current clients use the validated configuration action module. The remaining legacy settings-reader name is a narrow authenticated compatibility path for dashboard availability. |
| Low | Document/settings client files and student new-request page | Unused card/icon/image imports, local Framer Motion table machinery, repeated modal markup, and effect-driven prop/search synchronization are removed. Global dependencies remain because other features still use them. |
| Low | `student-directory-data.ts`, new `clerk-account-snapshot.ts` | Provider pagination duplicated between directory/settings/last-admin reads. One bounded account reader now enforces page length, total, duplicate, and scan-time checks; the batch-16 directory retains its contract and behavior. |

Earlier migrations, monetary evidence, reports, screenshots, and the committed
checkpoint remain intact. No unrelated assets or historical database fields were
deleted.

## 5. Performance and reliability

| Priority | Location | Finding and implemented recommendation |
| --- | --- | --- |
| High | Catalog readers/writers | Unbounded catalog reads and oversized responses could make management unusable. Complete catalog snapshots are capped at 1,000 documents and 2,000,000 UTF-8 bytes. Short serializable write transactions enforce count/byte limits before committing growth. Exceeding a bound rolls back rather than creating an unloadable catalog. Larger catalogs require a paged read model. |
| Medium | Database mutations | Document edits and setting writes use compare-and-set versions with monotonic millisecond timestamps. New-document IDs support safe create replay; matching retries are no-ops. Serialization/uniqueness/stale conflicts require refresh, without automatic mutation retries. No external provider call runs inside these configuration transactions. |
| Medium | Snapshot/cache handling | A confirmed first save could initially leave SWR's fallback snapshot unchanged; browser checks exposed and fixed this. Canonical action results now update either the populated cache or its initial fallback. Malformed successful refreshes are classified as data failures (retain verified rows, block edits), rather than falsely claiming an account change. |
| Medium | Refresh and initial loading | There is no interval polling, duplicate mount fetch with matching initial data, or automatic error retry loop. Focus/reconnect reads are throttled/deduplicated; manual recovery remains available. Provider account scans retain the 5,000-account/20-second elapsed-check bounds, and role responses have a 2 MB budget. SDK reads already in flight are not cancelled by a browser timeout. |
| Medium | Student request entry and notification defaults | Malformed availability/payment settings or unavailable catalog reads no longer produce a permissive request form. An empty active catalog renders an explicit unavailable state without seeding. Notification defaults remain usable by Next/browser code and the native Node migration smoke tool through an explicit ESM module. |

A single setting is saved at a time; this is not a multi-key configuration release.
Catalog capacity checks are deliberately bounded full reads inside rare management
writes, not a proposed architecture for an arbitrarily large catalog. Native-hosted
Postgres contention, live Clerk behavior, and authenticated deployment integration
remain release verification.

## Validation

- **688 Vitest tests in 35 files passed**, including 73 new checks: 25 model/price,
  24 action/read/API, 11 database integration, nine fetcher/provider-read, and four
  student-entry render cases. The database tests use an owned in-memory Postgres
  instance, actual Prisma/`pg` adapters, all nine existing migrations, and synthetic
  data. They cover exact/zero prices, create replay, stale/concurrent edits, audit
  rollback, unchanged request quotes, explicit initialization, malformed-setting
  repair, frozen notification content, and count/response-size limits.
- **91 isolated Chrome checks passed**: the 73 prior checks plus 18 configuration
  cases. They cover price display, canonical cache updates, explicit initialization,
  frozen retries, guarded double activation, cancelled drafts/messages, malformed/
  unavailable reads, stale editors, role confirmation, account changes, protected
  404 responses, late results, and phone dialogs. The affected 18 checks were
  repeated after the shared-default/native-import fix.
- **All four migration scenarios passed with zero Prisma drift**, including the
  native Node smoke-tool import and real client CRUD in disposable databases.
  No schema/migration file was changed or applied to an application database.
- TypeScript, focused ESLint, production build, and loopback cron HTTP checks
  passed. Full lint improves from **8 errors / 18 warnings** to **4 errors /
  3 warnings**; the remaining auth-page errors and student-dashboard warnings are
  reserved for batch 18. Lint-gated CI is not yet fully green.
- The [phone document editor](assets/17-document-editor.png) was visually reviewed.
  Browser fixtures use synthetic auth/data/action responses and block unrelated
  outbound requests. They do not verify a live Clerk account or deployed site.
- Diff whitespace/conflict checks passed. Dependency versions, environment
  variables, the existing daily cron schedule, and migration files are unchanged.
  The dependency audit was not unnecessarily repeated.

## Rollout and remaining work

1. Release the configuration API, actions, read helpers, and client components
   together. Reload open document/settings tabs; the action signatures and DTOs
   have changed. Do not deploy the verification-only `.next` output—rebuild with
   intended deployment configuration.
2. Keep the earlier migration/reconciliation prerequisites. Batch 17 adds no
   migration or environment variable. Empty catalogs remain empty until an
   administrator explicitly adds documents or confirms the standard catalog.
3. Inspect invalid stored settings before saving a repair. Fields shown as defaults
   are not an assertion about an invalid record's effective behavior. Unsupported/
   oversized legacy catalog records need reviewed operational recovery.
4. Continue with **batch 18: authentication/role/session and remaining student
   flow hardening**. The role-operation concurrency and session-revocation findings
   above remain open. This batch completes the local document/operational-setting
   validation and UI criteria, not every original audit finding.

| Area | Files |
| --- | --- |
| Contracts/defaults/loaders | `src/lib/configuration-model.ts`, `configuration-defaults.mjs`, `configuration-data.ts`, `configuration-fetcher.ts`, `configuration-roles.ts`, `clerk-account-snapshot.ts` |
| Actions/API/session | `src/app/actions/configuration.actions.ts`, `admin.actions.ts`, `src/app/api/admin/configuration/route.ts`, `src/components/admin-configuration-session.tsx` |
| Document/settings UI | Document client/data/editor; settings client/data/page, setting editor, role-management panel |
| Consumers | Student new-request page/form, `src/lib/notification-content.ts`, `student-directory-data.ts` |
| Coverage/tooling | Five configuration/request-render test files, `vitest.setup.ts`, `scripts/configuration-fixture/`, `scripts/navigation-checks/configuration.pw.ts`, navigation fixture server, build-check comment |
| Documentation | `README.md`, batch-16 follow-up link, this report, `assets/17-document-editor.png` |

No new commit, push, merge, destructive Git operation, deployment, live database
write, real financial operation, or message to another person was performed.
Installed Next.js server-action/form/revalidation guides, React practices, Clerk
authentication guidance, and Postgres transaction guidance informed the work.
