# F-002 Admin Authentication Remediation

Date: 2026-07-16
Finding: F-002 hardcoded admin fallback credentials and optional Supabase profile enforcement
Status: Implemented and locally validated. Not committed, pushed, or deployed.

## Inspection Summary

The previous implementation:

- supplied source-controlled fallback values for the admin username, password, and session secret;
- used one static cookie token without an identity, issue time, or signed expiry;
- allowed `FASTFLEET_ADMIN_REQUIRE_SUPABASE_PROFILE` to disable Supabase authorization;
- duplicated optional authorization logic between the admin page and API helper;
- did not link the dedicated username/password login to a stable Supabase administrator;
- did not reject cross-origin mutating admin requests.

Every protected route under `app/api/admin` used `requireAdminSession()`. The admin-only hero-image path in `app/api/uploads/route.ts` was also a consumer. No database migration was required because F-001 already protects `profiles.is_admin` and `profiles.deleted_at` provides a soft-deletion signal.

## Implemented Changes

- Removed all admin credential and signing-secret fallbacks.
- Added central fail-closed validation for required, non-blank configuration.
- Required `FASTFLEET_ADMIN_SECRET` to contain at least 32 characters.
- Added `FASTFLEET_ADMIN_USER_ID` as the stable link to the intended Supabase Auth administrator.
- Replaced the static cookie value with an HMAC-SHA-256 signed payload containing:
  - version;
  - issued-at time;
  - expiry time;
  - Supabase administrator user ID.
- Kept the session lifetime at 12 hours and retained `HttpOnly`, production `Secure`, `SameSite=Lax`, root path, and explicit `Max-Age`.
- Added timing-safe HMAC-based credential comparisons and timing-safe signature verification.
- Made the admin page and every protected admin API request use the same authorization helper.
- Rechecked the linked Supabase Auth user and protected `profiles.is_admin` value on every request.
- Rejected missing, deleted, soft-deleted, banned, demoted, mismatched, or lookup-failed administrators.
- Added Origin/Referer same-origin enforcement for admin login, logout, protected admin mutations, and admin-only hero-image uploads.
- Preserved the existing admin-login rate limit and replaced credential-specific public errors with generic errors.
- Removed known admin credential examples from repository documentation and added the new required user ID.
- Added `FASTFLEET_ADMIN_USER_ID` to the production readiness environment checks.

## Files Changed

Core authentication and entry points:

- `lib/admin-auth.ts`
- `app/api/admin/_auth.ts`
- `app/api/admin/login/route.ts`
- `app/api/admin/logout/route.ts`
- `app/admin/page.tsx`
- `app/api/health/readiness/route.ts`

Protected mutation call sites:

- `app/api/admin/businesses/route.ts`
- `app/api/admin/company-transactions/route.ts`
- `app/api/admin/deliveries/route.ts`
- `app/api/admin/fleet-assets/route.ts`
- `app/api/admin/hub-promotion-slides/route.ts`
- `app/api/admin/main-hero-slides/route.ts`
- `app/api/admin/malls/route.ts`
- `app/api/admin/marketplace-listings/route.ts`
- `app/api/admin/restaurants/route.ts`
- `app/api/admin/riders/route.ts`
- `app/api/admin/risk-signals/route.ts`
- `app/api/admin/site-controls/route.ts`
- `app/api/admin/states/route.ts`
- `app/api/admin/withdrawals/route.ts`
- `app/api/uploads/route.ts`

Tests and documentation:

- `tests/security/f002-admin-auth-regression.test.mjs`
- `security-remediation/02-admin-auth-remediation.md`
- `types/.env.example`
- `README.md`
- `PROJECT_DOCUMENTATION.md`
- `SUPABASE_ADMIN_SETUP.md`
- `SUPABASE_PRODUCTION_GO_LIVE.md`

## Required Vercel Environment Variables

Set these for every environment that must support admin access:

- `FASTFLEET_ADMIN_USERNAME`
- `FASTFLEET_ADMIN_PASSWORD`
- `FASTFLEET_ADMIN_SECRET`
- `FASTFLEET_ADMIN_USER_ID`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

`FASTFLEET_ADMIN_SECRET` must be at least 32 characters. Do not prefix any admin credential, secret, user ID, or service-role key with `NEXT_PUBLIC_`.

## Supabase Requirement

`FASTFLEET_ADMIN_USER_ID` must identify the intended user in Supabase Authentication. That user must:

- still exist;
- not be banned or disabled;
- have a `public.profiles` row with the same `user_id`;
- have `profiles.is_admin = true`;
- have `profiles.deleted_at is null`.

F-001 database protections are relied upon to prevent normal users from assigning `is_admin=true`. No new Supabase schema or dashboard configuration is required.

## Session Impact

All cookies created by the pre-F-002 static-token implementation become invalid immediately after deployment. Administrators must log in again. A later password change does not by itself invalidate an already issued session, but rotating `FASTFLEET_ADMIN_SECRET`, demoting the Supabase profile, banning/deleting the Auth user, or soft-deleting the profile revokes access.

## Credential Rotation

Before deployment:

1. Generate a new strong admin password outside the repository.
2. Generate a new random session secret of at least 32 characters outside the repository.
3. Set the four required admin variables in Vercel without exposing their values in logs or source control.
4. Confirm the Supabase user ID and protected admin profile.
5. Deploy the code.
6. Confirm the previous credentials and all previous admin cookies fail.
7. Log in with the rotated credentials and complete read and mutation smoke tests.

At minimum rotate:

- `FASTFLEET_ADMIN_PASSWORD`
- `FASTFLEET_ADMIN_SECRET`

Rotating `FASTFLEET_ADMIN_USERNAME` is also recommended because the previous username was source-controlled.

## Deployment Checklist

1. Confirm the intended production Supabase Auth user ID.
2. Confirm its non-deleted profile has `is_admin=true`.
3. Set all required Vercel variables for Production and any intended Preview environment.
4. Confirm the secret length requirement.
5. Deploy during a window where an admin re-login is acceptable.
6. Check `/api/health/readiness` without publishing its detailed output publicly.
7. Confirm missing/incorrect credentials do not set `fastfleet_admin_session`.
8. Confirm a valid administrator can log in.
9. Confirm one admin GET and one admin mutation succeed from the real site.
10. Confirm a cross-origin mutation is rejected.
11. Demote a staging administrator and confirm access is lost immediately, then restore only if authorized.
12. Monitor server logs for generic `[admin-auth]` configuration or authorization failures; secret values are never logged.

## Rollback

Preferred emergency response:

1. Keep the rotated credentials and secret.
2. Roll back only the F-002 application commit.
3. Understand that the old code reintroduces the static-cookie design and optional Supabase enforcement.
4. If rollback is unavoidable, set the old profile-enforcement switch to its secure value and schedule immediate redeployment of F-002.
5. Rotate the session secret again after returning to the fixed version.

Do not roll back F-001 or alter the secured role/profile database protections.

## Remaining F-002 Risk

- The dedicated username/password remains a single-factor credential. Strong secret storage, rate limiting, limited administrator access, and monitoring remain important.
- A session remains usable until its 12-hour expiry unless the Supabase account/profile is revoked or the signing secret is rotated.
- The readiness endpoint exposes configuration status and should be access-controlled or monitored carefully as a separate hardening task.

## Validation Results

Passed:

- `npm test`: 17 passed, 0 failed, 7 guarded F-001 staging tests skipped.
- `npm run typecheck`: passed.
- `npm run lint`: passed with 0 errors and 73 existing project warnings.
- `npm run build`: passed; the same existing lint warnings were reported.
- `git diff --check`: passed.
- Final source searches found no old hardcoded admin credential values, no admin credential fallbacks, no `NEXT_PUBLIC_` admin secrets, and no active `FASTFLEET_ADMIN_REQUIRE_SUPABASE_PROFILE` dependency.
- All protected admin GET handlers use the shared session/Supabase helper.
- All protected admin POST, PUT, PATCH, and admin-only upload handlers pass the request to the same-origin-aware shared helper.

No destructive or production-connected security tests were run.

## Recommended Commit Message

`security: remediate F-002 admin authentication`
