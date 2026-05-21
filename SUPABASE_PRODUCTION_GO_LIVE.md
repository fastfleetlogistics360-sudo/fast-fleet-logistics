# FastFleet Supabase Production Go-Live Checklist

Use this before switching the public site from preview/demo storage to live Supabase data.

## 1. Create the production Supabase project

- Create one production Supabase project.
- Keep the Project URL and anon public key for frontend config.
- Keep the service role key private. Use it only in secure server environments, never in browser JavaScript.

## 2. Run the database schema

- Open Supabase SQL Editor.
- Run `supabase-schema.sql`.
- Confirm these tables exist: `users`, `deliveries`, `rider_profiles`, `rider_documents`, `wallets`, `wallet_transactions`, `withdrawal_requests`, `support_tickets`, `platform_launch_states`, `platform_settings`, `risk_signals`, `company_transactions`.

## 3. Configure auth

- Enable Email auth.
- Add production redirect URLs:
  - `https://your-domain.com/auth`
  - `https://your-domain.com/dashboard`
- If using Google or Apple login, add their provider client IDs/secrets in Supabase Auth Providers.

## 4. Configure frontend environment

For the Next app, set these in your host environment:

```txt
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FASTFLEET_ADMIN_USERNAME=FastFleetAdmin
FASTFLEET_ADMIN_PASSWORD=change-this-before-launch
FASTFLEET_ADMIN_SECRET=long-random-secret
PAYSTACK_SECRET_KEY=your-live-or-test-paystack-secret
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

Do not put service role keys, admin passwords, or Paystack secret keys in client-side code.

## 5. Test live workflows

- Create a customer account.
- Place a delivery order.
- Confirm the order appears in Supabase.
- Open `/admin`, update delivery status, and confirm the tracking timeline changes.
- Create a rider account and submit KYC.
- Approve or reject rider KYC from admin.
- Submit support ticket and confirm it appears in Supabase.
- Test Paystack wallet top-up in test mode before switching to live keys.

## What to share with Codex

Safe to share for wiring:

- Supabase Project URL.
- Supabase anon public key.
- Your production domain.
- Which Next-compatible host or adapter you are using.
- Screenshots of Supabase table errors or Auth redirect settings.

Do not paste these into chat unless you intentionally want them handled in your local files:

- Supabase service role key.
- Paystack secret key.
- Admin password.
- OAuth provider secrets.
