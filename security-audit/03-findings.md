# Findings

Severity scale: Critical, High, Medium, Low. Status values: Confirmed, Likely, Needs Validation.

## F-001 - Authenticated Users Can Self-Escalate To Admin

Severity: Critical
Status: Confirmed
OWASP: ASVS access control, API3:2023 object property authorization, API5:2023 function authorization

### Evidence

- `supabase-schema.sql:64-75` defines `public.users.role`.
- `supabase-schema.sql:78-92` defines `public.profiles.account_type`, `profiles.is_admin`, and KYC status.
- `supabase-schema.sql:111-129` defines `current_user_role()` and `current_user_is_admin()` from those profile tables.
- `supabase-schema.sql:2333-2342` lets a user update/insert their own `users` row with only `auth.uid() = id`; it does not restrict `role`.
- `supabase-schema.sql:2354-2358` lets a user update their own `profiles` row and does not restrict `account_type`, `is_admin`, or `kyc_status`.
- `middleware.ts:56-61` trusts `profiles.account_type` or `users.role` for admin route decisions.
- `supabase-schema.sql:2410-2424`, `2571-2636`, `2782-2839`, `2936-2946` repeatedly trust `current_user_role() = 'admin'` or `current_user_is_admin()`.
- `app/auth/callback/route.ts:59-71`, `app/auth/confirm/route.ts:52-60`, and `lib/auth/roles.ts:24-31` accept `admin` as a parseable role.
- `supabase-schema.sql:262-310` accepts `admin` from Auth raw metadata during new-user trigger.

### Impact

A signed-in customer/rider/business user can attempt direct Supabase writes to become `admin` or set `is_admin=true`. Once successful, admin RLS policies and admin route middleware can be bypassed. This threatens all users, wallets, withdrawals, KYC reviews, delivery operations, marketplace listings, and platform settings.

### Remediation

- Revoke or block client updates to role/admin/KYC review fields.
- Add RLS `with check` conditions that preserve immutable role/admin fields for normal users.
- Move role changes to service-role-only RPCs with explicit admin authorization.
- Remove `admin` from any user-controlled signup/callback role parsing.
- Add database tests proving normal users cannot update `users.role`, `profiles.account_type`, `profiles.is_admin`, rider/business review fields, or wallet/admin tables.

## F-002 - Hardcoded Admin Fallback Credentials And Optional Profile Enforcement

Severity: High
Status: Confirmed
OWASP: ASVS authentication, API2:2023 broken authentication, API5:2023 broken function authorization

### Evidence

- `lib/admin-auth.ts:5-7` defines default admin username, password, and secret when env vars are missing.
- `app/api/admin/_auth.ts:5-16` accepts a valid admin cookie and skips Supabase admin profile verification unless `FASTFLEET_ADMIN_REQUIRE_SUPABASE_PROFILE === "true"`.
- `app/admin/page.tsx:14-32` has the same optional profile enforcement.
- `app/api/admin/login/route.ts` rate-limits login, but the fallback secret still exists.

### Impact

If production misses admin env vars or deploys with defaults, admin access becomes guessable from source. If an admin cookie is stolen or generated from known fallback material, API admin endpoints accept it.

### Remediation

- Remove all default admin credentials/secrets.
- Fail closed if any admin auth env var is missing.
- Require Supabase admin profile validation in production.
- Add CSRF/origin checks or server-side action tokens on mutating admin endpoints.
- Rotate admin credentials after fixing this issue.

## F-003 - Daily Commission Cron Is Public If CRON_SECRET Is Missing

Severity: High
Status: Confirmed
OWASP: API5:2023 broken function authorization, API6:2023 sensitive business flows

### Evidence

- `vercel.json:1-8` schedules `/api/wallet/daily-commission`.
- `app/api/wallet/daily-commission/route.ts:18-24` exposes both GET and POST.
- `app/api/wallet/daily-commission/route.ts:49-54` returns authorized when `CRON_SECRET` is absent.
- `app/api/wallet/daily-commission/route.ts:30-37` uses the service-role admin client to process all active business/rider accounts.

### Impact

Anyone can trigger the commission run if the cron secret is not configured. The job is mostly idempotent per account/date, but a public trigger can cause early deductions, notification noise, operational confusion, and abuse of a privileged service-role path.

### Remediation

- Require `CRON_SECRET`; never default to public.
- Prefer POST only.
- Validate Vercel cron header if available and keep bearer secret as defense in depth.
- Log run id, actor, source IP, and result counts.

## F-004 - KYC And Document Uploads Trust Client File Type

Severity: High
Status: Confirmed
OWASP: ASVS file upload controls, API4:2023 resource consumption

### Evidence

- `app/api/uploads/route.ts:8-17` supports profile photos, rider documents, business documents, and hero images with a 7 MB limit.
- `app/api/uploads/route.ts:62-67` validates image MIME only for hero images.
- `app/api/uploads/route.ts:69-87` uploads bytes with `file.type || "application/octet-stream"` and returns URL/path/type.

### Impact

Authenticated users can upload arbitrary content to KYC/document buckets if they provide a document type. This increases storage abuse, malware distribution, unsafe preview, and compliance risk for government ID/business documents.

### Remediation

- Enforce allowlists by upload kind: images for profile, PDF/JPEG/PNG for documents, image only for hero.
- Verify magic bytes server-side, not only `file.type`.
- Add filename extension checks, object metadata, malware scanning, and per-user rate/quota.
- Keep KYC documents private and serve via short-lived signed URLs.

## F-005 - Delivery Proof Images Are Public And Broadly Readable

Severity: High
Status: Confirmed
OWASP: ASVS privacy, API3:2023 object property authorization

### Evidence

- `supabase-schema.sql:3039-3041` creates `delivery-proofs` as a public bucket.
- `supabase-schema.sql:3097-3100` allows any signed-in user to select delivery proof objects.
- `app/api/rider/pickup-proof/route.ts:94-100` uploads proof images to `delivery-proofs` and stores/returns a public URL.

### Impact

Package proof photos may reveal customer goods, addresses, labels, or private premises. Public bucket URLs can continue to work outside the intended delivery participants.

### Remediation

- Make `delivery-proofs` private.
- Restrict object read policies to assigned rider, customer, linked business, and admin.
- Store object path, not permanent public URL.
- Generate short-lived signed URLs only when an authorized participant opens the order.

## F-006 - Service Worker Stores Checkout Requests And Caches Authenticated Pages

Severity: Medium
Status: Confirmed
OWASP: ASVS session/cache controls, MASVS storage/privacy

### Evidence

- `public/sw.js:34-49` stores marketplace checkout URL, body, and headers in IndexedDB and replays them later.
- `public/sw.js:96-103` intercepts failed marketplace checkout POSTs and queues them.
- `public/sw.js:125-134` caches navigation responses without excluding authenticated dashboards/customer/business/rider pages.

### Impact

Checkout data and request headers can persist locally after logout or account switching. Authenticated page HTML can be cached on shared devices. Offline replay can submit stale orders after the user's context has changed.

### Remediation

- Do not store auth headers/cookies or full checkout bodies offline.
- Add explicit idempotency keys and user confirmation before replay.
- Exclude authenticated routes from service-worker page caching.
- Clear offline queues on logout/account switch.

## F-007 - No Signed Payment Webhook Flow Found

Severity: Medium
Status: Confirmed
OWASP: ASVS business logic, API10:2023 unsafe consumption of APIs

### Evidence

- `lib/payments/squad.ts:94-145` initiates and verifies Squad transactions using the server secret.
- `app/api/deliveries/verify/route.ts:9-81`, `app/api/marketplace/verify/route.ts:13-50`, and `app/api/wallet/verify/route.ts:6-60` finalize payments through authenticated GET verification.
- Repository search found no Squad webhook route or provider signature verification handler.

### Impact

The existing verification checks are good, but they depend on browser callback/polling behavior. If the user closes the browser, server reconciliation may be delayed. A signed webhook gives the backend an independent source of payment truth and a better audit trail.

### Remediation

- Add a Squad webhook endpoint with raw-body signature verification.
- Make finalization idempotent per provider reference.
- Keep the current user-facing verify route as a status refresh, not the only settlement path.

## F-008 - Rate Limiting Is Incomplete

Severity: Medium
Status: Confirmed
OWASP: API4:2023 unrestricted resource consumption, API6:2023 sensitive business flows

### Evidence

- `lib/rate-limit.ts:20-29` defines rate-limit policies for admin login, payments, estimates, maps, account lookup, and rider jobs.
- Routes without observed `enforceRateLimit` include `app/api/uploads/route.ts`, `app/api/location/current/route.ts`, `app/api/business/*`, many `app/api/admin/*`, `app/api/wallet/withdrawals/route.ts`, and support direct Supabase writes.

### Impact

Attackers can spam document uploads, support tickets, business/team/dispatch flows, location updates, and admin mutations if authenticated or if admin auth is compromised.

### Remediation

- Apply per-user and per-IP rate limits to all mutating routes.
- Add storage quotas for uploads.
- Add business-flow limits for registrations, KYC submissions, support, location, and withdrawals.

## F-009 - Support Tickets And Messages Are Too Permissive

Severity: Medium
Status: Confirmed
OWASP: API3:2023 object property authorization, API4:2023 resource consumption

### Evidence

- `supabase-schema.sql:2083-2122` defines support tickets/messages.
- `supabase-schema.sql:2909-2928` allows anyone to insert support tickets and support messages with `with check (true)`.
- `components/support/support-ticket-form.tsx:33-47` and `components/support/support-widget.tsx:71-104` write directly through the browser Supabase client.

### Impact

Anonymous or authenticated users can create unlimited support records. A user who knows or guesses a ticket id can attempt to attach messages because message insert policy does not require ticket ownership.

### Remediation

- Route support submission through a server endpoint with rate limiting and captcha/turnstile if public.
- For `support_messages`, require the ticket to belong to `auth.uid()` or be an admin insert.
- Add length limits and spam controls.

## F-010 - Global Browser Security Headers Are Missing

Severity: Medium
Status: Confirmed
OWASP: ASVS security headers, API8:2023 security misconfiguration

### Evidence

- `next.config.ts:25-50` sets headers for `/sw.js` and static images only.
- No global CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, or `Permissions-Policy` was observed.

### Impact

The application has weaker browser-level protection against XSS impact, clickjacking, referrer leakage, and unneeded browser features.

### Remediation

- Add a production CSP with nonces/hashes as needed.
- Add HSTS, `frame-ancestors 'none'` or a precise allowlist, `Referrer-Policy`, `X-Content-Type-Options`, and `Permissions-Policy`.
- Ensure headers do not break PWA/native WebView behavior before launch.

## F-011 - Server Maps Routes Can Fall Back To Public Browser Key

Severity: Medium
Status: Confirmed
OWASP: API10:2023 unsafe consumption of APIs, API8:2023 security misconfiguration

### Evidence

- `app/api/maps/address-autocomplete/route.ts:5` falls back to `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- `app/api/maps/place-details/route.ts:6` falls back to `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- `app/api/maps/reverse-geocode/route.ts:5` falls back to `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- `lib/maps/route-distance.ts:17-19` correctly uses `GOOGLE_ROUTES_API_KEY`.

### Impact

If the public browser key is enabled for server-side Places/Geocoding use, it may be abused from the client package. If it is browser-restricted, server fallback can fail unexpectedly.

### Remediation

- Require server-only keys for all server route calls.
- Keep public browser key restricted to browser referrers and only APIs needed by the client.
- Add key-specific quota alerts.

## F-012 - Cross-State Rider Acceptance Logic Conflicts Between API And Database

Severity: Medium
Status: Confirmed
OWASP: ASVS business logic consistency

### Evidence

- `app/api/rider/jobs/route.ts:391-399` allows cross-state matching when rider location is fresh, pickup is within 10 km, and bicycle route is within 10 km.
- `lib/location/proximity.ts:6-9` defines 10 km pickup and bicycle route limits with 10 minute freshness.
- `supabase-schema.sql:1367-1447` defines `accept_delivery_offer`.
- `supabase-schema.sql:1415-1419` still rejects if pickup address text does not match the rider state.

### Impact

Riders may see valid cross-state jobs in the API/UI but fail at accept time inside the database function. This is an operational reliability issue and may drive manual admin overrides.

### Remediation

- Move the same cross-state distance rules into `accept_delivery_offer` or into a service-role RPC that validates one canonical rule.
- Add tests for bicycle, motorcycle/bike, car, and van acceptance across adjacent states.

## F-013 - Moderate Dependency Advisory In Production Audit

Severity: Moderate
Status: Confirmed
OWASP: ASVS dependency management

### Evidence

- `npm audit --omit=dev` reported `postcss <8.5.10` via `next`, with 2 moderate vulnerabilities.
- The suggested `npm audit fix --force` would install `next@9.3.3`, which is a breaking downgrade and should not be used blindly.

### Impact

The advisory is moderate and tied to CSS stringify XSS behavior. Risk depends on whether untrusted CSS is stringified/rendered through the vulnerable path.

### Remediation

- Track the Next.js dependency path and upgrade to a safe Next release when available.
- Do not run `npm audit fix --force` without review.

