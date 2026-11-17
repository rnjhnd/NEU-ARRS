# Explicit PostgreSQL TLS mode

Implemented locally after release `93b3bda`. Not committed or deployed. No
environment values, credentials, database records or provider settings changed.

## Finding and fix

The installed `pg-connection-string` parser warns when `sslmode` is `prefer`,
`require` or `verify-ca` without explicit libpq compatibility. These modes
currently behave as `verify-full`, but the driver documents weaker semantics
for those names in its next major version.

`src/lib/postgres-connection.ts` normalizes only those deprecated aliases to
`sslmode=verify-full` before `src/lib/prisma.ts` constructs its runtime Pool.
This preserves the driver's current certificate and hostname verification and
removes the ambiguous-mode warning at its source. Warnings are not suppressed.

The normalization preserves credentials, host, port, database and unrelated
query parameters. Duplicate query parameters follow the installed driver's
last-value behavior. Invalid URL errors contain no connection-string input.

Other modes, missing modes and explicit `uselibpqcompat=true` are unchanged.
This is not a general enforcement policy for every possible operator-supplied
TLS setting. Disposable test connections retain `sslmode=disable`; explicit
libpq compatibility remains an operator decision. No
`rejectUnauthorized=false`, certificate-check override or insecure fallback
was introduced.

Operator migration and reconciliation tools retain their explicit
`MIGRATION_DATABASE_URL` and do not use runtime configuration. README guidance
now calls for `sslmode=verify-full` on hosted runtime and operator connections.

## Verification

- Thirteen regression cases use the installed `pg.Client` constructor without
  opening network connections. They cover all three aliases, the absence of
  deprecation warnings, default TLS verification, encoded credentials and query
  preservation, explicit compatibility, duplicate parameters, disposable
  non-TLS connections, and sanitized invalid-configuration errors.
- TypeScript, ESLint and **969 tests across 47 files** passed. The production
  Turbopack build and isolated HTTP smoke checks passed against an owned
  disposable database with synthetic provider keys. `git diff --check` passed.
  The generated `.next` output is verification-only and must not be deployed.
- Browser checks were not repeated because this change has no UI or navigation
  changes. No schema or dependency changes required migration or audit changes.
- Production connectivity and disappearance of the hosted warning are not
  claimed before this change is released and checked against its deployment.

## References

- Installed `node_modules/pg-connection-string/index.js` and
  `node_modules/pg/lib/connection-parameters.js` are the implementation evidence.
- [node-postgres SSL configuration](https://node-postgres.com/features/ssl)
  explains that URL SSL parameters replace a separate `ssl` configuration.
- [Neon secure connections](https://neon.com/docs/security/security-overview)
  documents support for certificate and hostname verification with `verify-full`.
