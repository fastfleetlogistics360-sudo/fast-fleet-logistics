# F-001 Controlled Staging Validation Runbook

Date: 2026-07-14
Scope: F-001 role/admin escalation lockdown only.

Do not begin F-002 from this runbook. Do not run any step against production until staging has passed and a separate controlled production window is approved.

## 1. Backup Instructions

Before staging migration:

1. Create a fresh Supabase staging backup or snapshot from the Supabase dashboard.
2. Export staging table data for at least:
   - `public.users`
   - `public.profiles`
   - `public.rider_applications`
   - `public.business_profiles`
   - `public.platform_settings`
3. Record the backup timestamp, Supabase project identifier, and migration checksum.

Before any future production migration:

1. Take a production database backup or point-in-time recovery marker.
2. Export the same critical tables listed above.
3. Confirm the backup can be restored before applying the migration.

## 2. Staging Safety Marker

Create this row only in staging:

```sql
insert into public.platform_settings (key, value)
values (
  'f001_staging_validation_marker',
  '{"environment":"staging","allow_f001_tests":true,"purpose":"f001_role_admin_validation"}'::jsonb
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
```

If `public.platform_settings` does not exist in staging, stop and investigate schema drift.

## 3. Required Staging Accounts

Use staging-only users. Do not use real production users.

`customer_a` baseline:

- `public.users.role = customer`
- `public.profiles.account_type = customer`
- `public.profiles.is_admin = false`

`rider_a` baseline:

- `public.users.role = rider`
- `public.profiles.account_type = rider`
- `public.profiles.is_admin = false`
- a `public.rider_applications` row exists for the user
- the row is not already admin-approved for the specific self-approval test

`business_a` baseline:

- `public.users.role = business`
- `public.profiles.account_type = business`
- `public.profiles.is_admin = false`
- a `public.business_profiles` row exists for the user
- the row is not already active/approved for the specific self-approval test

`admin_a` baseline:

- manually verified legitimate staging administrator
- `public.users.role = admin`
- `public.profiles.account_type = admin`
- `public.profiles.is_admin = true`

Do not create `admin_a` through public signup metadata. Use trusted Supabase admin tooling or service-role SQL after manual approval.

## 4. Environment Variables

Safe public/config values:

```bash
F001_STAGING_ENABLE=1
F001_STAGING_CONFIRM=I_UNDERSTAND_THIS_IS_STAGING
F001_STAGING_SUPABASE_URL=...
F001_PRODUCTION_SUPABASE_URL=...
F001_STAGING_SUPABASE_ANON_KEY=...
F001_STAGING_MARKER_KEY=f001_staging_validation_marker
```

Sensitive values:

```bash
F001_STAGING_SUPABASE_SERVICE_ROLE_KEY=...
F001_STAGING_CUSTOMER_A_PASSWORD=...
F001_STAGING_RIDER_A_PASSWORD=...
F001_STAGING_BUSINESS_A_PASSWORD=...
F001_STAGING_ADMIN_A_PASSWORD=...
```

Test-user identifiers:

```bash
F001_STAGING_CUSTOMER_A_EMAIL=...
F001_STAGING_RIDER_A_EMAIL=...
F001_STAGING_BUSINESS_A_EMAIL=...
F001_STAGING_ADMIN_A_EMAIL=...
```

Never print, screenshot, commit, or paste the service-role key or test passwords into reports.

## 5. Preflight

Run the complete read-only script:

```text
security-remediation/database-preflight.sql
```

Expected result sets:

- `users_by_role`: role counts are explainable.
- `profiles_by_account_type`: account-type counts are explainable.
- `unexpected_profile_account_type_review`: zero rows.
- `admin_flags`: counts match manually known staging admins.
- `role_profile_mismatch_review`: zero rows unless every row is explained.
- `admin_review`: every row is manually confirmed as legitimate.
- `self_approved_profile_kyc_review`: no unexplained non-pending profile KYC rows.
- `orphan_profiles_review`: zero rows or manually reconciled before migration.
- `duplicate_profiles_review`: zero rows.
- `missing_profiles_review`: zero rows or manually reconciled before migration.
- `existing_role_lockdown_objects`: useful for detecting prior partial F-001 deployment.
- `existing_role_lockdown_triggers`: useful for detecting prior partial F-001 deployment.
- `required_schema_objects`: every `is_present` is true.
- `required_schema_columns`: every `required_before_migration=true` row has `is_present=true`; `profiles.is_admin` and `profiles.kyc_status` may be absent before F-001 because the migration adds them.
- `existing_policy_review`: policies are reviewed for material differences from the repo.

Stop before migration if any of these happen:

- unknown admin user
- conflicting admin indicators
- missing user/profile rows
- unexpected `account_type`
- duplicate profiles
- missing schema object or column
- materially different policy/function behavior
- inability to manually confirm every admin

## 6. Migration Execution

Migration file:

```text
security-remediation/migrations/202607140001_f001_role_admin_lockdown.sql
```

Checksum:

```text
sha256 d4ca6d74ff8a1cbe2b08dff0b706472e7f47fda68cb1f17fa803bcfdf443ea26
```

Rules:

1. Apply the entire file as one script.
2. Do not copy and run fragments.
3. Confirm the script starts with `begin;` and ends with `commit;`.
4. Record execution timestamp.
5. Capture errors without including secrets.
6. Abort if preflight was not reviewed.
7. Do not auto-modify existing user roles to make the migration pass.

The migration is intended to be transactional. If it fails before the final `commit;`, PostgreSQL should roll back the transaction.

## 7. Postflight

Run the complete read-only script:

```text
security-remediation/database-postflight.sql
```

Expected results:

- `required_functions`: all F-001 functions are present.
- `required_triggers`: users/profiles F-001 triggers are present.
- rider/business review-protection functions and triggers are present for staging authorization checks.
- `rls_enabled`: RLS is true on checked public tables.
- `f001_profile_columns`: `profiles.is_admin` and `profiles.kyc_status` exist.
- `required_policies`: expected users/profiles policies are present.
- `handle_new_auth_user_source`: `legacy_admin_allowlist_position = 0`; role/account allowlist positions are nonzero.
- `staging_marker`: environment is `staging`; `allow_f001_tests` is true.

Stop if any expected result is missing.

## 8. Direct Supabase Tests

Run local tests against staging only after preflight, migration, and postflight pass.

```bash
F001_STAGING_ENABLE=1 \
F001_STAGING_CONFIRM=I_UNDERSTAND_THIS_IS_STAGING \
F001_STAGING_SUPABASE_URL=... \
F001_PRODUCTION_SUPABASE_URL=... \
F001_STAGING_SUPABASE_ANON_KEY=... \
F001_STAGING_SUPABASE_SERVICE_ROLE_KEY=... \
F001_STAGING_CUSTOMER_A_EMAIL=... \
F001_STAGING_CUSTOMER_A_PASSWORD=... \
F001_STAGING_RIDER_A_EMAIL=... \
F001_STAGING_RIDER_A_PASSWORD=... \
F001_STAGING_BUSINESS_A_EMAIL=... \
F001_STAGING_BUSINESS_A_PASSWORD=... \
F001_STAGING_ADMIN_A_EMAIL=... \
F001_STAGING_ADMIN_A_PASSWORD=... \
npm test
```

The tests use real authenticated Supabase sessions and then reread rows through the staging service role to prove privileged fields did not change.

Expected blocked actions:

- customer, rider, and business cannot set `users.role = admin`
- customer, rider, and business cannot set `profiles.account_type = admin`
- customer, rider, and business cannot set `profiles.is_admin = true`
- customer, rider, and business cannot set `profiles.kyc_status = approved`
- rider cannot self-approve rider application status or review fields
- business cannot self-approve registration status or review fields
- public signup metadata with `role=admin`, `account_type=admin`, or `is_admin=true` cannot persist admin state

Expected allowed actions:

- customer, rider, and business can update safe profile fields
- legitimate `admin_a` retains admin access
- `admin_a` can perform one safe reversible update to the staging marker row

## 9. Manual OAuth And Email Confirmation Tests

These are manual because they depend on the deployed staging app and provider callback URLs.

For OAuth:

1. Start a staging OAuth flow with a crafted redirect carrying `role=admin` or `account_type=admin`.
2. Complete the callback.
3. Read `public.users` and `public.profiles`.
4. Confirm no admin state was persisted.

For email confirmation:

1. Start a staging email signup or confirmation flow with a crafted callback carrying `role=admin` or `account_type=admin`.
2. Complete confirmation.
3. Read `public.users` and `public.profiles`.
4. Confirm no admin state was persisted.

For stale sessions:

1. Use an existing customer/rider/business session created before the migration.
2. Refresh the app.
3. Confirm dashboard routing uses trusted database role and no stale Auth metadata grants admin access.

## 10. Existing-User Smoke Tests

Run in staging:

- existing customer login
- existing rider login
- existing business login
- existing administrator login
- customer safe profile update
- rider onboarding
- rider KYC submission for review
- business registration
- business KYC submission for review
- profile photo update
- normal dashboard routing
- no user unexpectedly downgraded
- no existing session receives admin privilege from stale metadata

Record expected and actual results in `security-remediation/15-test-results.md`.

## 11. Rollback Procedure

If the migration fails before `commit;`:

1. Confirm PostgreSQL rolled back the transaction.
2. Rerun `database-preflight.sql`.
3. Fix the cause in staging only.
4. Reapply the full migration script.

If the migration commits and must be reverted:

1. Use the staging backup/snapshot first when possible.
2. Otherwise, restore the previous `handle_new_auth_user()` body and previous users/profiles policies from version control.
3. Drop only the F-001 triggers if emergency rollback is approved:
   - `users_protect_privileged_fields`
   - `profiles_protect_privileged_fields`
4. Drop only the F-001 helper/protection functions if emergency rollback is approved:
   - `public.current_request_has_role_admin_privilege()`
   - `public.protect_users_privileged_fields()`
   - `public.protect_profiles_privileged_fields()`
5. Rerun preflight and smoke tests.

Rollback reopens the original F-001 risk and must be treated as temporary.

## 12. Emergency Recovery

If legitimate admins are locked out in staging:

1. Do not loosen public RLS policies for normal users.
2. Use Supabase SQL editor/service-role access to inspect `public.users` and `public.profiles`.
3. Restore only verified admin rows to:
   - `users.role = admin`
   - `profiles.account_type = admin`
   - `profiles.is_admin = true`
4. Rerun postflight.
5. Rerun the direct staging tests.

If normal users cannot update safe profile fields:

1. Capture the failing SQLSTATE and sanitized error.
2. Confirm the attempted update does not include privileged fields.
3. Review the users/profiles update policy and trigger behavior.
4. Fix in staging before any production migration.
