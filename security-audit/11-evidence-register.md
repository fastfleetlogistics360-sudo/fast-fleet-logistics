# Evidence Register

| ID | Evidence | Summary |
| --- | --- | --- |
| E-001 | `package.json` | Next.js/React/Supabase/Capacitor dependency stack. |
| E-002 | `middleware.ts:6-14`, `54-73` | Protected prefixes and role-based redirects. |
| E-003 | `supabase-schema.sql:64-92` | `users` and `profiles` role/admin fields. |
| E-004 | `supabase-schema.sql:111-129` | Helper functions derive role/admin status from mutable tables. |
| E-005 | `supabase-schema.sql:262-310` | New auth user trigger accepts `admin` from raw metadata. |
| E-006 | `supabase-schema.sql:2333-2358` | Owner policies allow updating role/admin fields. |
| E-007 | `components/auth/choose-account-type-form.tsx:55-75` | Client writes user/profile role fields for selected role. |
| E-008 | `components/auth/phone-auth-form.tsx:139-174` | Client upserts role/profile on auth flow. |
| E-009 | `lib/auth/profile-completion.ts:17-45` | Auth callback upserts role/profile. |
| E-010 | `lib/auth/roles.ts:24-31` | `admin` is a parseable role. |
| E-011 | `app/auth/callback/route.ts:59-71` | OAuth callback persists parsed metadata/request role. |
| E-012 | `app/auth/confirm/route.ts:52-60` | Email confirm persists parsed role. |
| E-013 | `lib/admin-auth.ts:5-7` | Hardcoded admin fallback values exist. |
| E-014 | `app/api/admin/_auth.ts:5-16` | Admin profile enforcement optional. |
| E-015 | `app/admin/page.tsx:14-32` | Admin page mirrors optional enforcement. |
| E-016 | `supabase-schema.sql:2258-2294` | RLS enabled across main tables. |
| E-017 | `supabase-schema.sql:2410-2495` | Rider/business policies trust current admin helpers. |
| E-018 | `supabase-schema.sql:2571-2636` | Delivery policies trust current admin helper. |
| E-019 | `supabase-schema.sql:2782-2839` | Wallet/transaction/withdrawal policies trust current admin helper. |
| E-020 | `supabase-schema.sql:3031-3125` | Storage buckets and policies. |
| E-021 | `app/api/uploads/route.ts:8-87` | Upload kinds, size limit, weak validation, service-role storage upload. |
| E-022 | `app/api/rider/pickup-proof/route.ts:94-100` | Delivery proof public URL generated. |
| E-023 | `public/sw.js:34-49`, `96-103`, `125-134`, `177-190` | Offline queue, page cache, notification click behavior. |
| E-024 | `next.config.ts:25-50` | Headers are only defined for service worker and image assets. |
| E-025 | `lib/payments/squad.ts:94-145` | Squad initiate and verify calls. |
| E-026 | `app/api/deliveries/checkout/route.ts:77-115` | Server-side delivery quote and total validation. |
| E-027 | `app/api/deliveries/verify/route.ts:34-81` | Provider verify, reference match, amount match. |
| E-028 | `app/api/marketplace/checkout/route.ts:77-84` | Marketplace amount validation. |
| E-029 | `app/api/marketplace/verify/route.ts:56-70` | Marketplace order ownership and amount validation. |
| E-030 | `app/api/wallet/topup/route.ts:45-64` | Wallet funding reference creation through RPC. |
| E-031 | `app/api/wallet/verify/route.ts:47-60` | Wallet funding completion through RPC. |
| E-032 | `supabase-schema.sql:1015-1156` | Wallet ensure/create/complete RPCs with owner checks and locks. |
| E-033 | `supabase-schema.sql:1206-1302` | Wallet delivery payment RPC with lock/idempotency. |
| E-034 | `supabase-schema.sql:1566-1762` | Withdrawal request/review functions. |
| E-035 | `app/api/wallet/daily-commission/route.ts:49-54` | Cron auth defaults open when `CRON_SECRET` missing. |
| E-036 | `app/api/wallet/daily-commission/route.ts:150-240` | Daily commission uses same-day new earnings. |
| E-037 | `lib/rate-limit.ts:20-59` | Rate-limit policies and enforcement. |
| E-038 | `supabase-schema.sql:2083-2122`, `2909-2928` | Support table and permissive insert policies. |
| E-039 | `app/api/maps/address-autocomplete/route.ts:5`, `place-details/route.ts:6`, `reverse-geocode/route.ts:5` | Server maps routes fall back to public key. |
| E-040 | `app/api/rider/jobs/route.ts:391-399` | API cross-state distance logic. |
| E-041 | `supabase-schema.sql:1415-1419` | Database acceptance state text gate. |
| E-042 | `android/.gitignore:3-8`, `55-58` | Android build and signing artifacts ignored. |
| E-043 | `store-submission/google-play-data-safety.md:5-42` | Data safety draft. |
| E-044 | `store-submission/native-build-checklist.md:30-84` | Native signing/location checklist. |
| E-045 | `app/api/health/readiness/route.ts:51-115` | Public readiness endpoint checks env/table status. |

## External References

- OWASP ASVS 5.0.0: https://owasp.org/www-project-application-security-verification-standard/
- OWASP API Security Top 10 2023: https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- OWASP Web Security Testing Guide: https://owasp.org/www-project-web-security-testing-guide/
- OWASP Mobile Application Security: https://mas.owasp.org/
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys

