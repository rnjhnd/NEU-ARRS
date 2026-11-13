# Password sign-in from a new device

The isolated test application's first password sign-in exposed a missing Device
Trust step. Clerk accepted the password but returned `needs_client_trust`; the
page displayed a generic additional-verification message with no way to finish.

**Priority: High.** Location: `src/app/sign-in/[[...sign-in]]/page.tsx`.

The page now offers an email-code form only when Clerk requests Device Trust and
advertises the `email_code` second factor. It sends and verifies the code through
the installed Core 3 `signIn.mfa` API, and finalizes the session only after Clerk
reports completion. Invalid codes and code-service failures keep the user on the
verification step. Resend and start-over controls permit recovery, and the
password is cleared when moving to verification. Rendering never sends a code.
Session-activation errors remain visible even if Clerk has already completed
code verification and the code form closes; a new password attempt clears the
previous verification error.

This retains Device Trust. It does not replace other factors with email or change
the identity provider's security configuration. SMS, email-link, enrolled MFA,
OAuth and account-registration flows were outside this change's live checks.

Validation on November 13, 2026 (Asia/Manila):

- Typecheck, ESLint and 784 tests across 40 files passed. Three new rendering
  regressions cover the pending device step, normal password entry, and keeping
  unsupported factors/MFA out of the email Device Trust form.
- The repository's safe production build check passed using a disposable
  database and synthetic provider settings.
- Separate Chrome test profiles signed in as synthetic student, employee and
  admin accounts using the real password and email-code UI. An incorrect code
  was rejected before a session was created for every role.
- The student saw only its own history, created one cash request through the
  actual form, and was denied staff/configuration APIs. Employee and admin saw
  that request in their queue. Employee configuration access and staff access
  to student-only history were denied. Admin role configuration loaded all three
  managed test identities.
- All test sessions were revoked and zero active sessions were confirmed.
  Application payment/email/Redis/cron credentials stayed disabled locally;
  notification and verified-money row counts remained zero.

The test identities and data are restricted to the separate test Clerk
application and Neon project. Passwords are kept in the ignored private workspace
directory with user/SYSTEM-only permissions. No production data was cloned,
provider configuration changed, or deployment created. The source fix needs the
normal review/commit/release process before it reaches the live site.

References: [Clerk Device Trust custom flow](https://clerk.com/docs/guides/development/custom-flows/authentication/device-trust),
[Clerk test email addresses](https://clerk.com/docs/guides/development/testing/test-emails-and-phones).
