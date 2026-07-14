# F-001 Staging Test Results

Date: 2026-07-14
Scope: F-001 role/admin lockdown staging validation preparation only.
Production access: Not performed.
Staging project identifier: Not executed. Record as a redacted value when staging is run.

## Migration Under Test

```text
security-remediation/migrations/202607140001_f001_role_admin_lockdown.sql
sha256: d4ca6d74ff8a1cbe2b08dff0b706472e7f47fda68cb1f17fa803bcfdf443ea26
```

The migration contains one `begin;` and one final `commit;`, so the F-001 DDL and policy changes are intended to run as one transaction.

## Local Regression Status

Latest local status before staging execution:

- `npm test`: 14 tests total, 7 passed, 7 skipped, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with existing warnings.
- `npm run build`: passed with existing warnings.
- Direct Supabase staging checks: not executed.
- Secrets printed in test output: no.
- Production URL safety gate: present.
- Database staging marker safety gate: present.

The staging tests intentionally skip unless explicit staging environment variables are supplied.

## Required Staging Environment

Safe public/config values:

- `F001_STAGING_ENABLE=1`
- `F001_STAGING_CONFIRM=I_UNDERSTAND_THIS_IS_STAGING`
- `F001_STAGING_SUPABASE_URL`
- `F001_PRODUCTION_SUPABASE_URL`
- `F001_STAGING_SUPABASE_ANON_KEY`
- `F001_STAGING_MARKER_KEY` optional, defaults to `f001_staging_validation_marker`

Sensitive values:

- `F001_STAGING_SUPABASE_SERVICE_ROLE_KEY`
- `F001_STAGING_CUSTOMER_A_PASSWORD`
- `F001_STAGING_RIDER_A_PASSWORD`
- `F001_STAGING_BUSINESS_A_PASSWORD`
- `F001_STAGING_ADMIN_A_PASSWORD`

Test-user identifiers:

- `F001_STAGING_CUSTOMER_A_EMAIL`
- `F001_STAGING_RIDER_A_EMAIL`
- `F001_STAGING_BUSINESS_A_EMAIL`
- `F001_STAGING_ADMIN_A_EMAIL`

Do not print or commit the service-role key or test passwords.

## Preflight Result

Not executed in this environment.

Expected before migration:

- `users_by_role`: review all role counts.
- `profiles_by_account_type`: review all account type counts.
- `unexpected_profile_account_type_review`: must return zero rows.
- `admin_flags`: every admin count must match manually known legitimate staging admins.
- `role_profile_mismatch_review`: stop on unexplained mismatches.
- `admin_review`: manually confirm every admin record.
- `self_approved_profile_kyc_review`: stop on unexplained self-approved KYC rows.
- `orphan_profiles_review`: must be reviewed before migration.
- `duplicate_profiles_review`: must return zero rows.
- `missing_profiles_review`: must be reviewed before migration.
- `required_schema_objects`: every `is_present` must be true.
- `required_schema_columns`: every `required_before_migration=true` row must have `is_present=true`; `profiles.is_admin` and `profiles.kyc_status` may be absent before F-001 because the migration adds them.
- `existing_policy_review`: compare materially different policies before migration.

## Postflight Result

Not executed in this environment.

Expected after migration:

- F-001 helper functions are present.
- F-001 protection triggers are present.
- Rider/business review-protection functions and triggers are present for direct staging checks.
- RLS is enabled on checked tables.
- `profiles.is_admin` and `profiles.kyc_status` exist.
- `handle_new_auth_user()` has no `admin` in the public metadata allowlist.
- The staging marker row exists with `environment=staging` and `allow_f001_tests=true`.

## Direct Authorization Matrix

| Actor | Attempt | Expected database result | Actual result | Row after attempt |
| --- | --- | --- | --- | --- |
| customer_a | `users.role = admin` | Reject with RLS/trigger error; role unchanged | Not executed | Pending staging readback |
| customer_a | `profiles.account_type = admin` | Reject; account type unchanged | Not executed | Pending staging readback |
| customer_a | `profiles.is_admin = true` | Reject; flag unchanged | Not executed | Pending staging readback |
| customer_a | `profiles.kyc_status = approved` | Reject; KYC unchanged | Not executed | Pending staging readback |
| customer_a | safe `profiles.full_name` update | Allow | Not executed | Pending staging readback |
| rider_a | `users.role = admin` | Reject; role unchanged | Not executed | Pending staging readback |
| rider_a | rider application status self-approval | Reject; status unchanged | Not executed | Pending staging readback |
| rider_a | `reviewed_by` or `reviewed_at` mutation | Reject; review fields unchanged | Not executed | Pending staging readback |
| rider_a | safe `profiles.full_name` update | Allow | Not executed | Pending staging readback |
| business_a | `profiles.account_type = admin` | Reject; account type unchanged | Not executed | Pending staging readback |
| business_a | business registration self-approval | Reject; registration status unchanged | Not executed | Pending staging readback |
| business_a | `reviewed_by` or `reviewed_at` mutation | Reject; review fields unchanged | Not executed | Pending staging readback |
| business_a | safe `profiles.full_name` update | Allow | Not executed | Pending staging readback |
| public signup | `role=admin`, `account_type=admin`, `is_admin=true` metadata | Created as customer or rejected; no admin field persisted | Not executed | Pending staging readback |
| admin_a | safe reversible `platform_settings` marker update | Allow, then restore marker | Not executed | Pending staging readback |

## Manual Staging Checks

The Node harness directly tests password-based signup and authenticated Supabase table writes. These flows still require manual staging validation because they depend on the deployed staging app, redirect URLs, or external OAuth provider behavior:

- OAuth callback carrying `role=admin`
- OAuth callback carrying `account_type=admin`
- Email confirmation callback carrying `role=admin`
- Email confirmation callback carrying `account_type=admin`
- Existing browser session with stale Auth metadata

For each manual check, read `public.users` and `public.profiles` after the attempt and record the actual row values.

## Existing Functionality Smoke Tests

| Flow | Expected result | Actual result |
| --- | --- | --- |
| Existing customer login | Login succeeds; no admin privilege | Not executed |
| Existing rider login | Login succeeds; no admin privilege | Not executed |
| Existing business login | Login succeeds; no admin privilege | Not executed |
| Existing administrator login | Admin access remains available | Not executed |
| Customer safe profile update | Allowed for safe fields | Not executed |
| Rider onboarding | Application can be submitted for review | Not executed |
| Rider KYC submission | Submission for review still works | Not executed |
| Business registration | Registration can be submitted | Not executed |
| Business KYC submission | Submission for review still works | Not executed |
| Profile photo update | Allowed where currently supported | Not executed |
| Normal dashboard routing | Routes according to trusted DB role | Not executed |
| Existing sessions | No stale metadata grants admin | Not executed |

## Remaining Warnings

- No direct Supabase staging authorization tests have been executed yet.
- No production SQL was run.
- The service-role key and test passwords must be supplied only through local shell environment variables.
- OAuth and email-confirmation role injection require manual staging app checks.
- F-002 admin authentication/cookie hardening has not been started.
