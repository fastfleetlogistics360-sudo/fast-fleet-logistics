# F-001 Role And RLS Remediation Report

Date: 2026-07-14
Branch: `security/full-remediation`
Finding: F-001 role/admin self-escalation
Status: Implemented in code and SQL migration. Staging validation setup prepared. Production SQL not executed.

## Summary

F-001 is remediated in the repository by separating trusted roles from self-service roles and adding database protection for privileged identity fields.

Normal users can still select or keep:

- `customer`
- `rider`
- `business`

Public/auth/client-controlled flows can no longer assign:

- `admin`
- `profiles.is_admin = true`
- non-default `profiles.kyc_status`

Existing users, sessions, orders, wallets, KYC records, and legitimate admin records are preserved. No data rewrite or destructive migration is included.

## Code Changes

- Added `SelfServiceRole`, `parseSelfServiceRole`, and `normalizeSelfServiceRole` in `lib/auth/roles.ts`.
- Updated OAuth callback and email confirmation routes to ignore `admin` from URL params/Auth metadata.
- Updated profile completion so public auth flows can only upsert customer/rider/business roles.
- Updated phone auth and choose-account-type UI types so public selection cannot use `admin`.
- Updated hub, booking, and marketplace listing role reads so Auth metadata is only trusted for self-service roles.
- Kept trusted database role reads compatible with existing admins.
- Added non-interactive ESLint config and a `npm test` script for security regression checks.

## SQL Changes

Migration file:

- `security-remediation/migrations/202607140001_f001_role_admin_lockdown.sql`

Schema snapshot updated:

- `supabase-schema.sql`

The migration adds:

- `public.current_request_has_role_admin_privilege()`
- `public.protect_users_privileged_fields()`
- `public.protect_profiles_privileged_fields()`
- `users_protect_privileged_fields` trigger
- `profiles_protect_privileged_fields` trigger
- safer `public.handle_new_auth_user()`
- stricter insert/update policies for `public.users` and `public.profiles`

## Preflight/Postflight

Added:

- `security-remediation/database-preflight.sql`
- `security-remediation/database-postflight.sql`

Run preflight before applying the migration in Supabase. Review any admin, mismatch, orphan, missing-profile, or non-pending KYC rows manually. Run postflight after migration to confirm functions, triggers, policies, and manual browser-write test steps.

## Staging Validation Preparation

Prepared on 2026-07-14 for F-001 only. F-002 was not started.

Migration checksum:

```text
d4ca6d74ff8a1cbe2b08dff0b706472e7f47fda68cb1f17fa803bcfdf443ea26  security-remediation/migrations/202607140001_f001_role_admin_lockdown.sql
```

Staging tests are guarded by all of these controls:

- `F001_STAGING_ENABLE=1`
- `F001_STAGING_CONFIRM=I_UNDERSTAND_THIS_IS_STAGING`
- `F001_STAGING_SUPABASE_URL`
- `F001_PRODUCTION_SUPABASE_URL`
- `F001_STAGING_SUPABASE_ANON_KEY`
- `F001_STAGING_SUPABASE_SERVICE_ROLE_KEY`
- staging marker row in `public.platform_settings`

The harness blocks the known production Supabase URL currently present in repository config and also aborts if the staging URL equals `F001_PRODUCTION_SUPABASE_URL`.

The migration now has a single `begin;` and a single final `commit;`, so the policy changes are inside the same transaction as the function and trigger changes.

Detailed staging instructions are in:

- `security-remediation/15-test-results.md`
- `security-remediation/17-deployment-runbook.md`

## Verification

Passed:

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

Notes:

- `npm run lint` now runs through the ESLint CLI instead of the deprecated interactive `next lint`.
- Lint exits successfully but reports existing project warnings unrelated to F-001.
- `npm audit --omit=dev` still reports the known moderate `postcss` advisory through `next`. I did not run `npm audit fix --force` because it would downgrade/break Next.

## Backward Compatibility

- Existing customer/rider/business flows remain supported.
- Existing legitimate admins remain supported when admin status is already in trusted database fields.
- Public signup/login no longer writes admin status.
- Direct browser writes to admin/KYC privilege fields are blocked at RLS/trigger level.
- No wallet, order, delivery, marketplace, KYC document, or historical transaction logic was changed.

## Remaining Risk

- The production Supabase project still needs the F-001 migration applied manually after preflight review.
- Existing suspicious admin rows, if any are discovered by preflight, need human review before cleanup.
- F-002 admin authentication remains the next critical remediation item.
