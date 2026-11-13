# Registrar verification of academic identity (S6)

Policy selected by the owner: registrar staff review the request against school
records. NEU-ARRS has no authoritative school directory/SIS integration. Clerk
authentication, email verification, payment, student metadata and a number's
format do not establish ownership of academic records.

## Implemented policy

An authenticated employee or administrator opens Request Details, confirms that
the account holder, name and student number match school records, and enters a
brief review reference/reason. The active attestation applies to that exact
request, Clerk account ID, name and student number. It does not verify the
account's other requests or become a globally verified student profile.

Staff must actually inspect the school's records and establish who controls the
requesting account, using the registrar's approved identity-check procedure.
The app records their attestation; it cannot perform the external records check.
Do not paste ID images, sensitive record contents, passwords or credentials into
the review reference. Staff cannot attest their own account.

`RequestIdentityReview` stores the attested identity, reviewing actor, time and
a foreign key to its audit evidence. Verification/revocation and the request's
monotonic version change commit in one transaction. Audit failure rolls back
the change. Stale or concurrent reviews cannot overwrite a newer decision.
Revocation removes the active attestation while preserving its original audit
and recording a new revocation audit. A subsequent review can verify it again.

Every staff transition into PROCESSING, READY_FOR_PICKUP or COMPLETED requires
an active attestation matching all identity fields. Administrator overrides and
bulk updates cannot bypass this check. A mixed ineligible batch fails atomically.
Changing any bound identity field invalidates the old attestation. Submitted
client verification flags are never trusted. Existing payment eligibility,
refund, cash-confirmation and transition requirements still apply.

Payments are recorded independently of identity review. An unverified online
request stays PENDING_PAYMENT with PAID financial state; it does not enter
PROCESSING. A reviewed request retains the automatic payment-to-processing
transition. The payment handler and review action take the same request-row lock
to serialize payment with verification/revocation. External provider calls are
outside these transactions. Repeated payment events remain deduplicated.

Students see the review requirement on the form and in pending request details.
Paid/cash pending rows display Awaiting Registrar rather than demanding another
payment. A reviewed request awaiting staff action also uses this label; it is
not a claim that review is still pending. Financial receipts remain available
under the existing payment/ownership policy. A receipt does not authorize release
of academic documents.

## Existing requests and rollout

The additive migration `20261113000100_request_identity_review` creates an empty
review table. It changes no request, payment, quote or historical financial data
and does not auto-attest any existing identity. Existing PROCESSING or
READY_FOR_PICKUP requests require registrar review before their next fulfillment
transition. Staff may still cancel under the existing cancellation policy.

COMPLETED and CANCELLED requests may receive a current attestation or have one
revoked with an audited reason. Its actual timestamp does not assert that the
registrar verified identity before the historical completion/cancellation. Review
does not change workflow status, creation date, or money. This permits authorized
corrections of older requests while preserving the existing override and payment
rules; cancelled online requests still cannot be reopened.

If submitted identity details are wrong, do not attest them. Cancel/reconcile the
request under the existing policy and have the student submit corrected details.
This batch does not add editing of identity on already quoted/paid requests.

Before production rollout: back up the database, apply this additive migration
with the explicit migration datasource, deploy the matching code, and instruct
registrar staff on the review step. The code expects the new table; do not
deploy it ahead of the migration. No production migration or deployment was
performed as part of this local implementation.

## Verification

Local results on 2026-11-13: typecheck and ESLint passed; 806 tests in 41 files
passed; 47 Chrome checks passed (26 staff queue and 21 student history); all four
disposable migration scenarios and the isolated production build passed. Prisma
schema validation and Git whitespace checks also passed. No dependency changes.

Disposable PostgreSQL integration tests exercise actual Prisma transactions,
staff denial, self-attestation denial, invalid/duplicate fields, exact snapshot
matching, stale/concurrent reviews, audit rollback, revocation, batch rollback,
terminal records, payment before/after review and cancellation availability.
Chrome component checks exercise explicit confirmation, duplicate activation,
successful verification/revocation, rejected reviews and the existing queue
controls. These use synthetic fixtures, not real school records or accounts.

Migration validation covers fresh deployment, zero drift, populated legacy
upgrade without automatic attestations, real Prisma CRUD/revocation, evidence
retention, and repeat deployment. Production acceptance still requires the
migration/deployment and an authorized registrar exercising the real records
review procedure. Live PayMongo/inbox/cron checks remain separate open validation
items from the original audit.
