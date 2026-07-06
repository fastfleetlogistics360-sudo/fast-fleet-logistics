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
FASTFLEET_ADMIN_USERNAME=FastFleetAdmin
FASTFLEET_ADMIN_PASSWORD=change-this-before-launch
FASTFLEET_ADMIN_SECRET=long-random-secret
SQUAD_SECRET_KEY=your-live-or-test-squad-secret
SQUAD_BASE_URL=https://sandbox-api-d.squadco.com
SQUAD_CALLBACK_ORIGIN=https://your-domain.com
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-browser-key
NEXT_PUBLIC_SITE_URL=https://your-domain.com
NEXT_PUBLIC_ALLOW_DEMO_DATA=false
NEXT_PUBLIC_ALLOW_SUPABASE_FALLBACK=false
```

Do not put service role keys, admin passwords, or Squad secret keys in client-side code.

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
