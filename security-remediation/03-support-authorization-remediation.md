# F-009 Support Authorization Remediation

Date: 2026-07-20
Finding: F-009 — Support Tickets And Messages Are Too Permissive
Status: Implemented in repository code and SQL. Production SQL and deployment not executed.

## Scope

This remediation is limited to support ticket/message authorization, support creation integrity, anonymous anti-spam, and support-specific tests. It does not change payments, Squad, wallets, commissions, pricing, marketplace behavior, rider jobs, delivery logic, uploads, storage, auth flows, or unrelated notifications.

## Authorization Model

### Anonymous

- No direct table privileges or support RLS policies.
- May create a ticket only through `POST /api/support` after rate limiting and successful Cloudflare Turnstile verification.
- Cannot read a ticket or add follow-up messages.

Anonymous follow-up is intentionally unsupported. The existing product has no anonymous support inbox or follow-up UI, so F-009 does not add a ticket token or a new conversation feature. Ticket UUIDs are not returned to anonymous callers and are never treated as access credentials.

### Authenticated owner

- May create a ticket only through `POST /api/support`.
- `user_id`, contact identity, priority, ticket status, and sender identity are derived by the server.
- May read only owned tickets/messages through RLS and explicit safe-column grants.
- Cannot read `admin_notes`, `assigned_admin_id`, `idempotency_key`, or message `sender_user_id`.
- Has no direct INSERT, UPDATE, or DELETE table privilege and therefore cannot change status, priority, assignment, admin notes, ownership, or sender type.

### Verified admin

- Has no cross-user browser RLS policy. All administrative support reads and mutations use the protected admin API.
- The admin API requires the signed admin session, current Supabase Auth user, non-banned/non-deleted Auth state, non-deleted profile, and current `profiles.is_admin = true` on every request.
- Admin replies derive `sender_type = 'admin'` and `sender_user_id` from the verified admin session.
- The current application does not expose ticket assignment, so no assignment feature was added.

### Service role

- Is the only support writer and bypasses RLS by design.
- May call `public.create_support_ticket_with_messages(...)`.
- The function itself verifies the request JWT role is `service_role`; EXECUTE is revoked from `public`, `anon`, and `authenticated`.

## Why Each Policy Exists

- `Authenticated owners read support tickets`: lets a signed-in user read only rows whose `user_id` equals `auth.uid()`; column grants omit internal notes, assignment, and idempotency data.
- `Authenticated owners read support messages`: permits reads only when the related ticket belongs to the caller; the column grant omits `sender_user_id`.
- No verified-admin browser policy: cross-user support access cannot outlive the stronger `requireAdminSession()` checks and is served only by the admin API's service-role client.
- No anonymous policy: anonymous creation is mediated by Turnstile and the server; anonymous reads/follow-up are not a product feature.
- No INSERT/UPDATE/DELETE policy for authenticated users: all privileged fields and sender identities stay server-controlled.
- No service-role policy: Supabase service-role JWTs bypass RLS; explicit grants and the restricted RPC document and constrain the intended write surface.

## Atomic And Idempotent Creation

Migration `security-remediation/migrations/202607200001_f009_support_authorization.sql` adds a nullable `idempotency_key` and unique index, preserving historical rows without a rewrite.

Migration SHA-256:

```text
80c8161eedb96274c0932a3b3f81c71cabca830c107c668c7074d3d184b15b07
```

The service-role-only `create_support_ticket_with_messages(...)` function:

1. Validates bounded server-derived input.
2. Inserts the ticket with fixed `status = 'open'`, no assignment, and no admin notes.
3. Inserts optional initial bot/customer messages with fixed sender identities.
4. Returns the existing ticket without adding messages when the same idempotency key and same request are retried.
5. Raises on conflicting reuse or any insert failure; PostgreSQL rolls back the whole function statement, leaving no orphan ticket.

## Contact And Sender Integrity

Authenticated requests ignore client-supplied name, email, and phone. The route uses the authenticated `profiles` row first and Supabase Auth identity as the fallback. Anonymous callers may supply bounded contact details.

The client sends only topic, message, tracking code, anonymous contact fields, source, idempotency key, and an anonymous Turnstile token. It never sends priority, `user_id`, `sender_type`, admin identity, or bot content.

## Turnstile

Anonymous support submission requires:

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the browser.
- `TURNSTILE_SECRET_KEY` only on the server.

The server validates every anonymous token with Cloudflare Siteverify, including the `support_submit` action, request hostname, a deployment-verified remote IP when available, and the idempotency UUID. Tokens are never logged. Authenticated users do not receive or need the challenge.

Support deliberately ignores generic `x-forwarded-for` and `x-real-ip` headers. Direct Vercel deployments use only `x-vercel-forwarded-for` (`VERCEL=1` auto-detection or `SUPPORT_TRUSTED_PROXY=vercel`). Cloudflare mode uses only `cf-connecting-ip` and must be enabled explicitly with `SUPPORT_TRUSTED_PROXY=cloudflare` after direct origin access is blocked or a verified proxy is configured. Unrecognized/self-hosted ingress produces `unknown-ip` until an equivalent verified edge is configured; it never falls back to a caller-supplied forwarding header.

## Notifications

The original F-009 remediation does not require notifications. No notification, email, or sensitive message preview was added. This keeps the change within authorization scope.

## Deployment

1. Back up the target Supabase database.
2. Confirm F-001 and F-008 migrations/deltas are already active.
3. Configure the staging Turnstile widget/keys and trusted proxy mode for the staging hostname and ingress.
4. Apply `security-remediation/migrations/202607200001_f009_support_authorization.sql` in staging.
5. Run the guarded F-009 staging RLS test and the manual checks below.
6. Configure separate production Turnstile keys and the production trusted proxy mode.
7. Deploy the F-009 application code only after the migration and environment variables are active.
8. Repeat the RLS/manual checks in the approved production verification window without using test customer data.

Do not rerun the complete canonical schema on an existing project.

## Rollback

If the application deployment must be rolled back, keep the F-009 no-browser-write policies in place and roll the application forward. Do not restore either permissive `with check (true)` policy. If the RPC must be disabled temporarily, revoke its service-role EXECUTE grant; support creation will fail closed without exposing direct table writes.

## Automated Tests

`tests/security/f009-support-authorization.test.mjs` executes the dependency-injected production POST handler for anonymous/authenticated submissions, mocked Turnstile results, profile lookup failures, spoofed contacts, concurrent same-key retries, and conflicting reuse. It also includes policy/schema regression checks, verified-proxy behavior tests, atomic RPC contract tests, and a guarded staging suite that races the real RPC and verifies forbidden owner columns.

The staging suite is disabled by default and requires all of:

- `F009_STAGING_ENABLE=1`
- `F009_STAGING_CONFIRM=I_UNDERSTAND_THIS_IS_STAGING`
- `F009_STAGING_SUPABASE_URL`
- `F009_PRODUCTION_SUPABASE_URL`
- `F009_STAGING_SUPABASE_ANON_KEY`
- `F009_STAGING_SUPABASE_SERVICE_ROLE_KEY`
- owner, unrelated-user, and verified-admin test account email/password variables documented in the test file
- a `platform_settings` marker with `environment = staging` and `allow_f009_tests = true`

Local verification completed on 2026-07-20:

- `npm test`: 102 passed, 8 guarded staging tests skipped, 0 failed. F-009 contributes 20 passing behavioral/regression tests and 1 guarded staging test.
- `npm run typecheck`: passed.
- `npm run lint`: passed with existing unrelated warnings and no errors.
- `npm run build`: passed; sandbox DNS failures from static Supabase fetch fallbacks were non-fatal.

## Manual Verification

1. Submit an anonymous ticket after completing Turnstile; confirm success without a ticket UUID in the response.
2. Submit without/with an invalid Turnstile token; confirm no ticket is created.
3. Sign in and submit without Turnstile; confirm the ticket uses profile contact values even if altered contact fields are sent.
4. Repeat a request with the same idempotency UUID; confirm one ticket and one initial message set.
5. Using anon and authenticated browser Supabase clients, confirm direct ticket/message inserts fail.
6. Confirm an owner can read safe ticket/message columns, cannot request `admin_notes`, `assigned_admin_id`, `idempotency_key`, or `sender_user_id`, and an unrelated account receives no rows.
7. Confirm an owner cannot update status, priority, assignment, admin notes, or `user_id`.
8. Confirm a verified admin receives no cross-user rows through a direct browser client but can read all tickets, reply with the correct admin `sender_user_id`, and update status through the admin API.
9. Force an initial-message constraint failure in staging and confirm the ticket insert rolls back.
