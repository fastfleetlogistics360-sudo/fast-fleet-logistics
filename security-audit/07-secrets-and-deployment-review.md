# Secrets And Deployment Review

## Environment Variables Detected

Values were not printed or copied.

Detected env names include:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Payments: `SQUAD_SECRET_KEY`, `SQUAD_BASE_URL`, `SQUAD_CALLBACK_ORIGIN`, `PAYSTACK_SECRET_KEY`
- Maps: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `GOOGLE_ROUTES_API_KEY`, `GOOGLE_PLACES_API_KEY`
- Admin: `FASTFLEET_ADMIN_USERNAME`, `FASTFLEET_ADMIN_PASSWORD`, `FASTFLEET_ADMIN_SECRET`
- Push/email: `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `FCM_PRIVATE_KEY`, `FIREBASE_PRIVATE_KEY`, `RESEND_API_KEY`
- Site: `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`

## Git Tracking Check

Quick checks found:

- `git ls-files` returned no tracked `.env`, `.env.local`, `scripts/.env.local`, `android/key.properties`, `android/upload-keystore.jks`, or generated AAB.
- `git log --all -- ...` returned no history for those sensitive paths.
- `android/.gitignore:3-8`, `55-58` ignores built AAB/APK and keystore/key properties.
- `git status --ignored` showed Android build/key artifacts are ignored.

## Deployment Risks

| Risk | Evidence | Recommendation |
| --- | --- | --- |
| Hardcoded admin fallback credentials | `lib/admin-auth.ts:5-7` | Remove fallbacks and fail closed. |
| Admin profile enforcement optional | `app/api/admin/_auth.ts:5-16` | Force Supabase admin profile check in production. |
| Public readiness endpoint reveals deployment state | `app/api/health/readiness/route.ts:51-115` | Restrict to admin or remove detailed production config status. |
| Server-side Maps fallback to public key | `app/api/maps/*` evidence in F-011 | Require server-only keys for server calls. |
| Service role broad access | `lib/supabase/admin.ts:4-18` | Keep server-only; ensure routes using it have strong auth and logging. |
| Cron secret optional | `app/api/wallet/daily-commission/route.ts:49-54` | Require `CRON_SECRET`. |

## Supabase Key Handling Notes

Supabase publishable/anon keys are expected to be public in web and mobile clients. Security depends on RLS. Supabase secret/service-role keys bypass RLS and must stay only in server-controlled environments.

## Native Signing Notes

- Android app id in submission docs: `com.fastfleetlogistics.app`.
- Android upload keystore and `android/key.properties` are ignored.
- Do not share screenshots showing `android/key.properties` values.
- Store upload keystore/password in a password manager and backup securely.
- After Play App Signing is enabled, configure the Play signing SHA-256 fingerprint for Android App Links.

