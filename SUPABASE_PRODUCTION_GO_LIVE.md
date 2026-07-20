# FastFleet Production Go-Live Checklist

Use this before switching the public site from preview/demo storage to live Supabase data.

## 1. Create the production Supabase project

- Create one production Supabase project.
- Keep the Project URL and anon public key for frontend config.
- Keep the service role key private. Use it only in secure server environments, never in browser JavaScript.

## 2. Run the database schema

- Open Supabase SQL Editor.
- Run `supabase-schema.sql`.
- Confirm these tables exist: `users`, `profiles`, `deliveries`, `delivery_events`, `delivery_locations`, `rider_profiles`, `rider_applications`, `rider_documents`, `wallets`, `wallet_transactions`, `withdrawal_requests`, `support_tickets`, `platform_launch_states`, `platform_settings`, `fraud_signals`, `company_transaction_logs`, `state_waitlist`, and `notifications`.
- Confirm the private `rider-documents` storage bucket exists.
- Confirm Realtime is enabled for delivery/tracking tables used by the app.

### Existing production projects: apply the secure-upload delta

Do **not** rerun the complete `supabase-schema.sql` against an existing production project. After taking a database backup, run `supabase-secure-upload-delta.sql` once in the Supabase SQL Editor. It makes `delivery-proofs` private, removes direct browser writes, and limits proof reads to the delivery customer, the assigned rider, and authorized admins. The application then creates a fresh signed link only when an authorized participant opens the proof.

### Existing production projects: apply the F-008 abuse-protection deltas

Before deploying the F-008 application code, take a database backup and run these two forward-only files once in the Supabase SQL Editor, in this order:

1. `supabase-rate-limit-delta.sql` — removes the browser write policies for flows that now go through protected server routes.
2. `supabase-storage-quota-delta.sql` — adds private, service-role-only storage quota accounting and its atomic reservation functions.

Do **not** rerun `supabase-schema.sql` for either change. Confirm that `public.rate_limit_buckets` and `public.consume_rate_limit(...)` already exist before deployment. If either F-008 delta fails, do not deploy the matching application code; fix the migration forward after reviewing the SQL error and the backup.

### Existing production projects: apply the F-009 support authorization migration

After F-008 is active and before deploying F-009 application code, back up the database and run `security-remediation/migrations/202607200001_f009_support_authorization.sql` once. This removes every anonymous/authenticated support write policy, limits owner reads to safe columns, removes direct cross-user admin browser access, and adds the service-role-only atomic ticket creation function.

Do not restore either `Anyone can create support ...` policy during rollback. If support creation must be paused, revoke the atomic function from `service_role` and roll the application forward while direct browser writes remain denied.

## 3. Configure auth

- Enable Email auth.
- Enable Confirm email if customers must verify before dashboard access.
- Add app redirect URLs in Supabase Authentication -> URL Configuration:
  - `https://fastfleet.com.ng/auth/callback`
  - `https://www.fastfleet.com.ng/auth/callback`
  - `http://localhost:3000/auth/callback`
- Set Site URL to `https://fastfleet.com.ng`.
- If using Google login, add the Google provider client ID and secret in Supabase Auth Providers.
- In Google Cloud, add the Supabase provider callback URL as an authorized redirect URI:
  - `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
- For iOS App Store submission, if the native iOS app keeps Google login, add an equivalent Apple-approved login option or remove Google login from the iOS build.

## 4. Configure Resend for Supabase confirmation emails

Confirmation emails are triggered by Supabase Auth, not by this Next.js app.

- In Resend, verify the sending domain, ideally `fastfleet.com.ng`.
- In Supabase, open Authentication -> Emails -> SMTP settings.
- Enable custom SMTP.
- Use Resend SMTP credentials:
  - Host: `smtp.resend.com`
  - Port: `465` or `587`
  - Username: `resend`
  - Password: your Resend API key
- Set Sender email to a verified address such as `no-reply@fastfleet.com.ng`.
- Save, then create a new test account with a fresh email address.
- If the email sends but the link fails, check the Auth URL Configuration and the confirmation email template contains Supabase's confirmation link variable.

## 5. Configure frontend environment

For the Next app, set these in your host environment:

```txt
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-public-turnstile-site-key
TURNSTILE_SECRET_KEY=your-server-only-turnstile-secret-key
SUPPORT_TRUSTED_PROXY=vercel
FASTFLEET_ADMIN_USERNAME=
FASTFLEET_ADMIN_PASSWORD=
FASTFLEET_ADMIN_SECRET=
FASTFLEET_ADMIN_USER_ID=
SQUAD_SECRET_KEY=your-live-or-test-squad-secret
SQUAD_BASE_URL=https://sandbox-api-d.squadco.com
SQUAD_CALLBACK_ORIGIN=https://your-domain.com
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-browser-key
NEXT_PUBLIC_SITE_URL=https://your-domain.com
NEXT_PUBLIC_ALLOW_DEMO_DATA=false
NEXT_PUBLIC_ALLOW_SUPABASE_FALLBACK=false
```

Do not put service role keys, Turnstile secret keys, admin passwords, or Squad secret keys in client-side code.

Create separate Cloudflare Turnstile widgets for staging and production and restrict each widget to its intended hostname. The site key is public; `TURNSTILE_SECRET_KEY` must remain server-only. Anonymous support submission fails closed when either key is missing. Authenticated support submission does not require Turnstile.

`SUPPORT_TRUSTED_PROXY=vercel` reads only Vercel's edge-generated `x-vercel-forwarded-for`; generic `x-forwarded-for` and `x-real-ip` are never trusted by support. Vercel is also auto-detected when `VERCEL=1`. Set `SUPPORT_TRUSTED_PROXY=cloudflare` only when the origin cannot be reached except through Cloudflare (for example, an approved verified-proxy/origin-lock configuration); that mode trusts only `cf-connecting-ip`. Any other deployment intentionally returns `unknown-ip` until its verified ingress is configured.

For `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, use a browser key restricted to your production and local-development HTTP referrers, enable only the Maps APIs the client actually needs, and configure billing-budget alerts and per-API quotas in Google Cloud. Server-mediated autocomplete, geocoding, and route calls have F-008 application limits; a browser Maps key cannot be protected by those server limits.

## 6. Run the production readiness endpoint

After deployment, open:

```txt
https://fastfleet.com.ng/api/health/readiness
```

The endpoint returns `200` only when the required production environment variables, Supabase admin access, critical tables, storage bucket, and Squad API check pass. Add this endpoint to your uptime monitor.

## 7. Test live workflows

- Create a customer account.
- Confirm the customer receives the Supabase/Resend confirmation email.
- Confirm the verification link lands on `/auth/callback` and then the correct dashboard.
- Place a delivery order.
- Confirm the order appears in Supabase.
- Open `/admin`, update delivery status, and confirm the tracking timeline changes.
- Create a rider account and submit KYC.
- Approve or reject rider KYC from admin.
- Submit support ticket and confirm it appears in Supabase.
- Submit an anonymous support ticket with Turnstile, then confirm missing/invalid tokens create no row.
- Submit a signed-in support ticket without Turnstile and confirm stored contact identity matches the authenticated profile.
- Confirm direct anon/authenticated browser inserts into `support_tickets` and `support_messages` are denied.
- Test Squad wallet top-up in sandbox before switching to live keys.
- Confirm receipts, wallet transactions, admin logs, and company transaction logs reconcile.

## 8. Store release readiness

- Android: generate and sign the native `.aab`, add native location permissions, complete Google Play Data Safety, run internal testing, then promote to production.
- iOS: generate and sign the native `.ipa`, add iOS location usage strings, complete App Privacy labels, test through TestFlight, and address the Google-login/Apple-login App Store rule.

## What to share with Codex

Safe to share for wiring:

- Supabase Project URL.
- Supabase anon public key.
- Your production domain.
- Which Next-compatible host or adapter you are using.
- Screenshots of Supabase table errors or Auth redirect settings.

Do not paste these into chat unless you intentionally want them handled in your local files:

- Supabase service role key.
- Squad secret key.
- Admin password.
- OAuth provider secrets.
