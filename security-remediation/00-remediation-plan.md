# FastFleets 360 Security Remediation Plan

Date: 2026-07-14
Branch: `security/full-remediation`
Baseline commit: `bb259200e8e0adb3b7d7d0490f381808cc40191a`
Mode: authorized defensive remediation. Do not deploy automatically.

## Baseline Results

| Check | Result | Notes |
| --- | --- | --- |
| Git status before branch | Dirty | `security-audit/` was untracked from the read-only audit deliverables. |
| Branch | Created | `security/full-remediation`. |
| `npm ci --prefer-offline` | Passed after network approval | First sandboxed attempt failed on registry DNS and partially refreshed `node_modules`; approved rerun completed from `package-lock.json`. |
| `npm run typecheck` | Passed | `tsc --noEmit`. |
| `npm run lint` | Baseline failing | `next lint` is deprecated and opened the setup prompt; lint is not non-interactive yet. |
| `npm test` | Baseline failing | No `test` script exists. |
| `npm run build` | Passed | Next production build completed successfully. |
| `npm audit --omit=dev` | Failing with known advisory | 2 moderate vulnerabilities: `postcss <8.5.10` via `next`; do not use `npm audit fix --force`. |

## Current Schema And Policy Inventory

Repository SQL files:

- `supabase-schema.sql`
- `supabase-kyc-self-approval-fix.sql`
- `supabase-launch-promo-delta.sql`
- `supabase-playstore-readiness-delta.sql`
- `supabase-user-location-routing-delta.sql`

Primary schema features found:

- Core identity tables: `public.users`, `public.profiles`
- Rider/business KYC tables and documents
- Delivery/order/marketplace tables
- Wallet, transactions, withdrawal requests, company ledger
- Location, realtime, notifications, promos, reviews, support, rate limits
- RLS enabled on main public tables in `supabase-schema.sql:2258-2294`
- Storage buckets and policies in `supabase-schema.sql:3031-3125`
- Security-definer functions for roles, wallets, KYC protection, delivery acceptance, withdrawals, rate limiting

## Role And Admin Trust Inventory

Code paths relying on role/admin authority include:

- `middleware.ts` uses `users.role` and `profiles.account_type`
- `app/dashboard/page.tsx`, `app/rider/dashboard/page.tsx`, `app/business/dashboard/page.tsx`, `app/book/page.tsx`, `app/hub/page.tsx`, `app/marketplace/listing/page.tsx`
- `app/auth/callback/route.ts`, `app/auth/confirm/route.ts`
- `components/auth/choose-account-type-form.tsx`, `components/auth/phone-auth-form.tsx`
- `lib/auth/roles.ts`, `lib/auth/profile-completion.ts`
- Admin cookie/session: `lib/admin-auth.ts`, `app/api/admin/_auth.ts`, `app/admin/page.tsx`, `app/api/admin/login/route.ts`
- RLS and DB helpers: `current_user_role()`, `current_user_is_admin()`, KYC review helpers, wallet/admin functions

## Implementation Order

1. F-001 role/admin self-escalation only.
2. F-002 admin authentication.
3. F-003 daily commission cron.
4. F-004/F-005 uploads and delivery proof privacy.
5. F-006 service worker/offline security.
6. F-007 Squad webhook/reconciliation.
7. F-008 rate limiting.
8. F-009 support authorization.
9. F-010 browser security headers.
10. F-011 Google Maps key separation.
11. F-012 rider eligibility unification.
12. F-013 dependency remediation.
13. Health, logging, monitoring, compatibility reports, final runbooks.

## Human Approval Required

Ask before:

- Running any SQL against production or a real Supabase project.
- Downgrading or modifying existing legitimate admin accounts.
- Making a migration that may lock large tables or alter historical financial records.
- Changing wallet balances, transaction history, pricing, or commission rules.
- Rotating public delivery proof objects or deleting historical proof evidence.
- Configuring external dashboards: Supabase deployed policies/storage, Vercel env vars, Squad webhook secret/URL, Google key restrictions, Firebase, monitoring.

## Finding Plan

| Finding | Affected files | Proposed change | Backward compatibility impact | Data migration requirement | Rollback strategy | Test requirement | Deployment order | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-001 role/admin escalation | `supabase-schema.sql`, new migration SQL, `lib/auth/roles.ts`, auth callback/confirm/profile completion, account-type forms, role-reading pages/APIs | Add server-controlled role protection, block normal users from changing privileged fields, disallow `admin` from user-controlled signup metadata, preserve existing legitimate admins, add regression tests/preflight/postflight | Existing customer/rider/business/admin rows preserved; users keep IDs and sessions; self-service role selection still allows customer/rider/business | Yes. Add preflight/report queries and a forward migration with rollback notes. No automatic admin downgrade without review. | Roll back policies/functions/triggers to prior definitions using rollback section; no destructive data changes planned | SQL/static regression tests proving admin cannot be self-assigned and user role flows still work | First | Critical |
| F-002 admin auth | `lib/admin-auth.ts`, `app/api/admin/_auth.ts`, `app/admin/page.tsx`, admin routes/tests | Remove hardcoded defaults, fail closed, require server-verified admin identity/profile, add CSRF/origin protection in later step | Current admins may need proper env vars and Supabase admin profile | No data migration unless adding audit table/role table | Re-enable temporary compatibility bridge only if verified admins are locked out | Tests for missing env, invalid cookie, cookie without admin profile, verified admin | After F-001 | High |
| F-003 cron | `app/api/wallet/daily-commission/route.ts`, tests, runbooks | Require `CRON_SECRET`, no mutation on GET, constant-time compare, audit run id | No wallet rule changes; existing commission basis unchanged | No balance migration | Restore previous endpoint behavior only in emergency, keep idempotency | Missing/wrong/correct secret, duplicate run, zero earnings | After admin auth | High |
| F-004 uploads | `app/api/uploads/route.ts`, upload helpers/tests | MIME/extension/magic-byte validation, server object names, quotas/rate limit, scanner hook | Existing stored paths remain valid; new uploads stricter | Possibly add upload audit/quarantine metadata later | Relax allowlist by config if a legitimate format is blocked | Fake MIME, HTML disguised as image, oversized/empty/unsupported file | After cron | High |
| F-005 delivery proofs | `supabase-schema.sql`, proof APIs/UI, storage policies | Make delivery proof bucket private, store object paths, serve short-lived signed URLs to participants | Historical public URLs need compatibility mapping; no deletion | Yes, report/map legacy proof URLs where possible | Revert bucket policy only if authorized proof access breaks; do not delete evidence | Cross-user proof read denied; participant signed URL allowed | With uploads | High |
| F-006 PWA/offline | `public/sw.js`, logout flows/tests | Exclude authenticated pages, remove automatic checkout replay, clear sensitive caches, same-origin notification URLs | PWA install and public offline page preserved; checkout drafts may need reconfirmation | No DB migration | Revert SW cache version if install/update breaks | Private page cache, logout clear, no replay, URL blocking | After storage | Medium |
| F-007 Squad webhook | New webhook route, settlement service, payment verify routes, tests | Add signed webhook after confirming official Squad signature docs; shared idempotent settlement service | Browser callbacks continue as status refresh | Maybe add webhook event log table | Disable webhook route and keep browser verify if provider config fails | Valid/invalid signature, wrong amount/currency, duplicate/race tests | After PWA | Medium |
| F-008 rate limiting | `lib/rate-limit.ts`, mutating routes, support/upload/admin/business/location/push/withdrawals tests | Centralize policies per user/IP/resource; add quotas and Retry-After | Avoid carrier-IP lockout by preferring user IDs where authenticated | Maybe add new buckets/columns if current table insufficient | Route-level rollback to previous policy if false positives block users | Spam/flood tests for sensitive routes | After webhook | Medium |
| F-009 support auth | `supabase-schema.sql`, support components/API, tests | Move public support creation to server route, bind messages to ticket owner/admin/token | Existing tickets/messages preserved | RLS migration, maybe public-ticket token field later | Restore owner/admin policies and keep read access | Cross-ticket insert denied; rate-limit and length tests | After rate limit | Medium |
| F-010 security headers | `next.config.ts`, route headers/tests | Add CSP report-only first, HSTS, referrer, frame-ancestors, permissions, no-store for private content | Must not break Maps, Squad, Supabase, PWA, Capacitor | No DB migration | Keep report-only until clean; revert header subset if integration breaks | Header assertions and integration smoke tests | After support | Medium |
| F-011 Maps keys | maps API routes, docs | Remove server fallback to `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, require server keys | Missing server env returns safe config error | No DB migration | Temporarily document missing-key fallback only in local dev if needed | Server key missing/fallback tests | After headers | Medium |
| F-012 rider eligibility | `app/api/rider/jobs/route.ts`, `supabase-schema.sql`, route-distance helpers/tests | Make DB acceptance use same canonical proximity/vehicle/location rules as API | Valid nearby cross-state jobs should work; stale/far jobs rejected | SQL function migration | Restore previous function if acceptance blocked unexpectedly, keeping test evidence | Boundary, bicycle, vehicle, stale location, concurrent accept | After maps | Medium |
| F-013 dependency advisory | `package.json`, `package-lock.json`, test/build docs | Investigate safe Next/PostCSS path; no forced downgrade | May affect build/runtime if Next upgraded | No DB migration | Revert dependency commit | Full build/typecheck/smoke; audit clean or documented residual risk | Late, controlled | Moderate |

## F-001 Initial Design

Canonical source for this phase:

- Keep existing `users.role` / `profiles.account_type` for compatibility, but make privileged values server-controlled.
- Normal users may keep selecting only `customer`, `rider`, or `business`.
- `admin` may not come from URL params, Auth metadata, account-type UI, or direct browser Supabase writes.
- Add database protection to preserve privileged fields on owner updates.
- Leave legitimate existing admins in place unless preflight flags need manual review.

F-001 deliverables:

- Forward SQL migration with purpose/preconditions/rollback/verification comments.
- `database-preflight.sql` and `database-postflight.sql` seeds focused on role/admin checks.
- Code changes to sanitize user-controlled roles.
- Static/SQL regression tests that verify the migration and auth code contain the required protections.
- F-001 remediation report.

