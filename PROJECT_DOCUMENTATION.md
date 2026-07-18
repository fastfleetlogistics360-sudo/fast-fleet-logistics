# FastFleet Logistics Project Documentation

This document explains how the FastFleet Logistics project works and how to maintain it. It is written for a beginner full-stack developer who needs enough context to run the app, understand the moving parts, and safely change backend functionality without guessing.

FastFleet is a logistics and marketplace web application for customers, riders, businesses, and admins. Customers can book deliveries, order from marketplace listings, track deliveries, and fund wallets. Riders can onboard, submit KYC, go online, accept jobs, update delivery statuses, upload proof of delivery, and request withdrawals. Businesses can register, manage dispatches, receive marketplace orders, and use wallet flows. Admins can review riders and businesses, launch states, control site settings, review withdrawals, update deliveries, manage marketplace menus, and inspect company/risk records.

## Table of Contents

1. Project mental model
2. Technology stack
3. Important folders and files
4. Local setup
5. Environment variables
6. Supabase setup
7. How authentication and roles work
8. Frontend route map
9. Backend API route map
10. Database and storage map
11. Main app workflows
12. Backend change playbooks
13. Admin and security rules
14. Payments, wallet, and withdrawal rules
15. Realtime tracking and maps
16. Deployment and production checklist
17. Testing and verification checklist
18. Troubleshooting guide
19. Known maintenance notes
20. Glossary

## 1. Project Mental Model

Think of the project as four layers:

1. The browser UI
   - Lives mostly in `app/` pages and `components/`.
   - Shows dashboards, forms, marketplace screens, tracking screens, and admin tools.
   - Calls `/api/...` routes for server actions that need secrets, validation, payment, or secure database writes.

2. The Next.js backend
   - Lives in `app/api/**/route.ts`.
   - Handles secure operations such as checkout, payment verification, rider job updates, admin reviews, file uploads, withdrawal requests, and readiness checks.
   - Uses Supabase either as the signed-in user or as the service-role admin client.

3. Supabase
   - Stores users, profiles, deliveries, orders, riders, businesses, wallets, transactions, support tickets, launch states, notifications, settings, documents, and tracking locations.
   - Handles Auth, Postgres database, Storage, Realtime, and Row Level Security.
   - The schema is in `supabase-schema.sql`.

4. Third-party services
   - Squad by GTCO/HabariPay handles payment initialization and verification.
   - Google Maps handles distance, autocomplete, place details, reverse geocoding, and optional map rendering.
   - Supabase Auth SMTP may use Resend, but confirmation emails are configured inside Supabase, not inside this Next.js app.

The most important rule is this:

If a feature needs a secret key, admin permission, money movement, or a database write that users should not control directly, do it in a server route or SQL RPC function, not directly in a client component.

## 2. Technology Stack

The project uses:

| Area | Technology | Purpose |
| --- | --- | --- |
| Framework | Next.js 15 | App Router, pages, API routes, middleware |
| Language | TypeScript | Safer frontend and backend code |
| UI | React 19 | Components and interactive screens |
| Styling | TailwindCSS | Utility-based styling |
| Motion | Framer Motion | Animations |
| Icons | lucide-react | UI icons |
| Auth and database | Supabase | Auth, Postgres, Storage, Realtime |
| Payments | Squad by GTCO/HabariPay | Card/transfer wallet and checkout payments |
| Maps | Google Maps APIs | Distance, Places, route helpers |
| Mobile wrapper | Capacitor | Native Android/iOS shell support |

The scripts in `package.json` are:

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run native:add:ios
npm run native:add:android
npm run native:sync
npm run native:open:ios
npm run native:open:android
```

## 3. Important Folders And Files

### Root files

| File | What it does |
| --- | --- |
| `README.md` | Short project overview and quick launch notes. |
| `package.json` | Scripts and dependencies. |
| `next.config.ts` | Next.js config. |
| `tailwind.config.ts` | Tailwind design configuration. |
| `middleware.ts` | Auth and role-based route protection. |
| `supabase-schema.sql` | Main Supabase database, RLS, storage, RPC, and realtime schema. |
| `SUPABASE_ADMIN_SETUP.md` | Admin-focused Supabase setup notes. |
| `SUPABASE_PRODUCTION_GO_LIVE.md` | Production readiness checklist. |
| `APP_STORE_READINESS.md` | Native app store guidance. |
| `capacitor.config.ts` | Capacitor native app config. |
| `vercel.json` | Vercel deployment config if used. |
| `types/.env.example` | Environment variable template. |

### App folder

The `app/` folder is the Next.js App Router folder.

| Folder or file | Purpose |
| --- | --- |
| `app/layout.tsx` | Global layout. |
| `app/globals.css` | Global CSS and Tailwind styles. |
| `app/page.tsx` | Main landing page. |
| `app/auth/page.tsx` | Auth page. |
| `app/auth/callback/route.ts` | OAuth callback and session exchange. |
| `app/auth/confirm/route.ts` | Email/OTP confirmation callback. |
| `app/book/page.tsx` | Customer delivery booking page. |
| `app/track/page.tsx` | Public tracking page. |
| `app/dashboard/page.tsx` | Legacy/customer dashboard redirect and guard. |
| `app/customer/dashboard/page.tsx` | Customer dashboard. |
| `app/rider/onboarding/page.tsx` | Rider application page. |
| `app/rider/dashboard/page.tsx` | Rider work dashboard. |
| `app/business/register/page.tsx` | Business registration page. |
| `app/business/dashboard/page.tsx` | Business operations dashboard. |
| `app/admin/page.tsx` | Admin login/panel entry. |
| `app/admin/dashboard/page.tsx` | Admin dashboard route. |
| `app/api/**/route.ts` | Backend API routes. |

### Components folder

The `components/` folder holds reusable UI and feature components.

| Folder | Purpose |
| --- | --- |
| `components/admin/` | Admin login and admin panel UI. |
| `components/auth/` | Auth forms and account type selection. |
| `components/booking/` | Customer booking flow. |
| `components/dashboard/` | Customer and business dashboard components. |
| `components/landing/` | Landing page sections. |
| `components/location/` | Location permission and address input components. |
| `components/marketplace/` | Restaurant and mall marketplace UI. |
| `components/onboarding/` | Rider and business onboarding flows. |
| `components/realtime/` | Live tracking hooks and consoles. |
| `components/rider/` | Rider dashboard UI. |
| `components/support/` | Support forms/widgets. |
| `components/tracking/` | Live order tracking UI. |
| `components/ui/` | Reusable UI primitives. |
| `components/wallet/` | Wallet cards, top-up, transaction history. |

### Lib folder

The `lib/` folder holds shared logic used by API routes and components.

| File | Purpose |
| --- | --- |
| `lib/supabase/client.ts` | Browser Supabase client. Use only in client components. |
| `lib/supabase/server.ts` | Server Supabase client using auth cookies. Use in server routes/components for signed-in user access. |
| `lib/supabase/admin.ts` | Supabase service-role client. Use only on the server. |
| `lib/supabase/config.ts` | Reads Supabase env vars and local fallback behavior. |
| `lib/admin-auth.ts` | Admin username/password cookie token helpers. |
| `lib/auth/roles.ts` | Role parsing and dashboard paths. |
| `lib/auth/profile-completion.ts` | Profile upsert helpers after auth. |
| `lib/fare.ts` | Core delivery fare estimate logic. |
| `lib/marketplace-pricing.ts` | Marketplace total, delivery fee, and pickup-address estimate logic. |
| `lib/dispatch.ts` | Rider scoring and sample rider helpers. |
| `lib/wallet-ledger.ts` | Wallet helper functions, rider/business credits, withdrawals, commissions. |
| `lib/company-ledger.ts` | Company transaction log helper. |
| `lib/launch-states.ts` | Nigerian states, live/waitlist states, launch status helpers. |
| `lib/kyc.ts` | KYC status display helpers. |
| `lib/storage.ts` | Browser image compression and storage upload helpers. |
| `lib/realtime.ts` | Supabase realtime channel helpers. |
| `lib/notifications.ts` | Client-side notification helpers. |
| `lib/maps/google-api.ts` | Google Maps browser key helpers. |
| `lib/payments/callback-url.ts` | Builds Squad callback origin. |
| `lib/payments/squad.ts` | Squad payment, verification, and bank account lookup helpers. |

### Types folder

| File | Purpose |
| --- | --- |
| `types/domain.ts` | App-level TypeScript types for roles, deliveries, statuses, fares, wallets, notifications. |
| `lib/supabase/types.ts` | Generated or maintained Supabase type helpers. |
| `types/.env.example` | Copy this into `.env.local` and fill values. |

## 4. Local Setup

### Step 1: Install dependencies

```bash
npm install
```

### Step 2: Create `.env.local`

Create `.env.local` in the project root using `types/.env.example` as the guide.

Minimum local values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FASTFLEET_ADMIN_USERNAME=
FASTFLEET_ADMIN_PASSWORD=
FASTFLEET_ADMIN_SECRET=
FASTFLEET_ADMIN_USER_ID=
SQUAD_SECRET_KEY=sandbox_or_live_squad_secret_key
SQUAD_BASE_URL=https://sandbox-api-d.squadco.com
SQUAD_CALLBACK_ORIGIN=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=optional-google-maps-key
NEXT_PUBLIC_ALLOW_DEMO_DATA=false
NEXT_PUBLIC_ALLOW_SUPABASE_FALLBACK=false
```

For local development only, the code can use fallback/demo behavior in some places. For production, fallback/demo behavior should be disabled.

### Step 3: Run the Supabase schema

Open your Supabase project, go to SQL Editor, paste the full contents of `supabase-schema.sql`, and run it.

This creates:

- Custom enum types.
- Tables.
- Indexes.
- Row Level Security policies.
- SQL RPC functions for wallet and dispatch safety.
- Storage buckets.
- Storage object policies.
- Realtime publication entries.
- Default launch states and platform settings.

### Step 4: Start the app

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### Step 5: Basic local smoke test

Check these pages:

- `/`
- `/auth`
- `/book`
- `/track`
- `/rider/onboarding`
- `/business/register`
- `/admin`

If a protected page redirects to `/auth`, that is expected until you sign in.

## 5. Environment Variables

Environment variables control backend behavior. Anything with `NEXT_PUBLIC_` is exposed to the browser. Anything without `NEXT_PUBLIC_` must stay server-only.

| Variable | Required | Browser visible | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Yes | Supabase public anon key used by browser/server auth client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for admin/server writes | No | Powerful Supabase key that bypasses RLS. Never expose it to browser code. |
| `FASTFLEET_ADMIN_USERNAME` | Yes | No | Admin login username for `/admin`. |
| `FASTFLEET_ADMIN_PASSWORD` | Yes | No | Admin login password for `/admin`. |
| `FASTFLEET_ADMIN_SECRET` | Yes | No | Secret of at least 32 characters used to sign admin session cookies. |
| `FASTFLEET_ADMIN_USER_ID` | Yes | No | Stable Supabase Auth user UUID linked to the dedicated admin credentials. |
| `SQUAD_SECRET_KEY` | Yes for payments | No | Squad secret key for initialization and verification. |
| `SQUAD_BASE_URL` | Optional | No | Overrides the Squad API origin. Use sandbox or live base URL to match the key. |
| `SQUAD_CALLBACK_ORIGIN` | Optional | No | Overrides callback origin for Squad redirects. |
| `PAYMENT_CALLBACK_ORIGIN` | Recommended | No | Canonical server-side payment callback origin. Set the approved HTTPS production host. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Yes | Public site URL. Used for callbacks and readiness. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional but recommended | Yes | Browser Google Maps key. Also used by some server routes as fallback. |
| `GOOGLE_MAPS_API_KEY` | Optional | No | Server Google Maps key for distance/reverse geocode. |
| `GOOGLE_PLACES_API_KEY` | Optional | No | Server Places API key for place details/autocomplete. |
| `RESEND_API_KEY` | Optional | No | Not used directly for Supabase Auth confirmation. Configure Resend SMTP in Supabase dashboard. |
| `NEXT_PUBLIC_ALLOW_DEMO_DATA` | Local/staging only | Yes | Enables demo fallbacks when true. Keep false in production. |
| `NEXT_PUBLIC_ALLOW_SUPABASE_FALLBACK` | Local/staging only | Yes | Allows fallback Supabase config. Keep false in production. |
| `CRON_SECRET` | Yes | No | Secret of at least 32 characters used to protect `/api/wallet/daily-commission`. |
| `DELIVERY_CONFIRMATION_SECRET` | Recommended | No | Secret of at least 32 characters used to encrypt and authenticate six-digit delivery PINs. Falls back to the service-role key when omitted. |
| `DELIVERY_SMS_WEBHOOK_URL` | Optional | No | Provider-neutral HTTPS webhook that sends delivery PIN messages to recipient phone numbers. |
| `DELIVERY_SMS_WEBHOOK_TOKEN` | Optional | No | Bearer token for the delivery SMS webhook. |

### Key safety notes

- Never put `SUPABASE_SERVICE_ROLE_KEY`, `SQUAD_SECRET_KEY`, `FASTFLEET_ADMIN_PASSWORD`, OAuth secrets, `CRON_SECRET`, or `DELIVERY_CONFIRMATION_SECRET` inside client components.
- Never rename env vars without updating every route that reads them.
- In production, set `NEXT_PUBLIC_ALLOW_DEMO_DATA=false` and `NEXT_PUBLIC_ALLOW_SUPABASE_FALLBACK=false`.
- `lib/supabase/config.ts` has fallback Supabase values for non-production use. Do not rely on those for production.

## 6. Supabase Setup

### Required Supabase services

FastFleet uses:

- Supabase Auth.
- Supabase Postgres.
- Supabase Storage.
- Supabase Realtime.
- Row Level Security.

### Required Supabase Auth settings

In Supabase dashboard:

1. Enable your required sign-in providers.
2. Configure email confirmation if needed.
3. Add redirect URLs in Supabase:
   - `http://localhost:3000/auth/callback`
   - `https://your-domain.com/auth/callback`
   - `https://your-domain.com/auth/confirm`
4. Set the site URL to the deployed domain.
5. If using Google/Apple auth, set provider secrets in Supabase Auth Providers, not in client code.
6. In Google Cloud, authorize Supabase's provider callback URL:
   - `https://your-project.supabase.co/auth/v1/callback`

### Required database setup

Run `supabase-schema.sql` fully.

The schema file is intentionally written with many `create table if not exists`, `alter table if exists`, and `drop policy if exists` statements so it can be rerun when the schema changes.

### Required storage buckets

The schema creates:

| Bucket | Public | Used for |
| --- | --- | --- |
| `rider-documents` | No | Rider KYC documents. |
| `business-documents` | No | Business KYC documents. |
| `delivery-proofs` | No | Private pickup/delivery proof images; participants receive short-lived signed access only. |
| `profile-photos` | Yes | User profile photos. |

### Required realtime tables

The schema adds these tables to Supabase Realtime:

- `orders`
- `deliveries`
- `delivery_events`
- `rider_locations`

The app also writes `delivery_locations`, which is used by live tracking. Confirm this table is enabled for realtime if live map updates depend on it in your production setup.

## 7. How Authentication And Roles Work

There are four user roles:

- `customer`
- `rider`
- `business`
- `admin`

The type is defined in `types/domain.ts`.

### Auth flow

1. User signs in through Supabase Auth from `/auth`.
2. Supabase redirects to `/auth/callback` or `/auth/confirm`.
3. The callback route exchanges the auth code/token for a session.
4. The app checks `profiles.account_type` and `users.role`.
5. The user is sent to the correct dashboard or `/choose-account-type`.

Important files:

- `app/auth/page.tsx`
- `app/auth/callback/route.ts`
- `app/auth/confirm/route.ts`
- `app/choose-account-type/page.tsx`
- `components/auth/phone-auth-form.tsx`
- `components/auth/choose-account-type-form.tsx`
- `lib/auth/roles.ts`
- `lib/auth/profile-completion.ts`

### Middleware protection

`middleware.ts` protects these route prefixes:

- `/dashboard`
- `/customer/dashboard`
- `/book`
- `/account/orders`
- `/choose-account-type`
- `/rider/dashboard`
- `/business/dashboard`
- `/admin/dashboard`

It also enforces role matching:

| Prefix | Allowed role |
| --- | --- |
| `/customer/dashboard` | `customer` |
| `/dashboard` | `customer` |
| `/rider/dashboard` | `rider` |
| `/business/dashboard` | `business` |
| `/admin/dashboard` | `admin` |

If a signed-in user visits a dashboard for another role, middleware redirects them to the correct home.

### Admin auth

Admin login is separate from normal customer/rider/business auth.

Important files:

- `app/admin/page.tsx`
- `components/admin/admin-login.tsx`
- `components/admin/admin-panel.tsx`
- `app/api/admin/login/route.ts`
- `app/api/admin/logout/route.ts`
- `app/api/admin/_auth.ts`
- `lib/admin-auth.ts`

How admin session works:

1. Admin submits username/password to `/api/admin/login`.
2. The route verifies credentials from env vars.
3. The linked Supabase Auth user must still exist, be enabled, and have a non-deleted profile with `is_admin=true`.
4. It sets a signed, expiring HTTP-only cookie named `fastfleet_admin_session`.
5. Admin pages and API routes call `requireAdminSession()`, which repeats the Supabase authorization check on every request.

Production recommendation:

- Set unique admin credentials; there are no defaults.
- Set a strong `FASTFLEET_ADMIN_SECRET`.
- Link the credentials to the intended administrator with `FASTFLEET_ADMIN_USER_ID`.

## 8. Frontend Route Map

| Route | File | Purpose |
| --- | --- | --- |
| `/` | `app/page.tsx` | Main landing page. |
| `/main` | `app/main/page.tsx` | Main product page/legacy landing route. |
| `/auth` | `app/auth/page.tsx` | Sign-in/sign-up page. |
| `/auth/callback` | `app/auth/callback/route.ts` | OAuth callback route. |
| `/auth/confirm` | `app/auth/confirm/route.ts` | Supabase email/OTP confirmation route. |
| `/choose-account-type` | `app/choose-account-type/page.tsx` | Role selection after auth. |
| `/book` | `app/book/page.tsx` | Customer delivery booking. |
| `/track` | `app/track/page.tsx` | Delivery tracking by code. |
| `/account/orders/[orderId]/track` | `app/account/orders/[orderId]/track/page.tsx` | Authenticated order tracking. |
| `/dashboard` | `app/dashboard/page.tsx` | Customer dashboard/legacy guard. |
| `/customer/dashboard` | `app/customer/dashboard/page.tsx` | Customer dashboard. |
| `/rider/onboarding` | `app/rider/onboarding/page.tsx` | Rider application. |
| `/rider/dashboard` | `app/rider/dashboard/page.tsx` | Rider dashboard. |
| `/rider/dashboard/[section]` | `app/rider/dashboard/[section]/page.tsx` | Rider dashboard section route. |
| `/business/register` | `app/business/register/page.tsx` | Business registration. |
| `/business/dashboard` | `app/business/dashboard/page.tsx` | Business dashboard. |
| `/restaurants` | `app/restaurants/page.tsx` | Restaurant marketplace. |
| `/restaurants/[kitchenId]` | `app/restaurants/[kitchenId]/page.tsx` | Single restaurant/kitchen page. |
| `/shopping-mall` | `app/shopping-mall/page.tsx` | Mall/shopping marketplace. |
| `/marketplace/callback` | `app/marketplace/callback/page.tsx` | Squad marketplace callback page. |
| `/delivery/callback` | `app/delivery/callback/page.tsx` | Squad delivery callback page. |
| `/delivery/details` | `app/delivery/details/page.tsx` | Delivery details page. |
| `/wallet/callback` | `app/wallet/callback/page.tsx` | Squad wallet top-up callback page. |
| `/admin` | `app/admin/page.tsx` | Admin login and panel. |
| `/admin/dashboard` | `app/admin/dashboard/page.tsx` | Admin dashboard route. |
| `/support` | `app/support/page.tsx` | Support page. |
| `/waitlist/thank-you` | `app/waitlist/thank-you/page.tsx` | Waitlist success page. |
| `/privacy` | `app/privacy/page.tsx` | Privacy page. |
| `/terms` | `app/terms/page.tsx` | Terms page. |
| `/cookies` | `app/cookies/page.tsx` | Cookies page. |
| `/ndpr` | `app/ndpr/page.tsx` | NDPR compliance page. |
| `/offline` | `app/offline/page.tsx` | PWA offline page. |

## 9. Backend API Route Map

All API routes live under `app/api`.

### Admin routes

Admin routes should always call `requireAdminSession()`.

| Method and path | File | Purpose | Important tables/services |
| --- | --- | --- | --- |
| `POST /api/admin/login` | `app/api/admin/login/route.ts` | Verify admin credentials and set admin cookie. | Env vars, cookie |
| `POST /api/admin/logout` | `app/api/admin/logout/route.ts` | Clear admin cookie. | Cookie |
| `GET /api/admin/states` | `app/api/admin/states/route.ts` | List Nigerian launch states and waitlist counts. | `platform_launch_states`, `state_waitlist` |
| `POST /api/admin/states` | `app/api/admin/states/route.ts` | Launch, pause, beta, or waitlist a state. | `platform_launch_states`, `state_waitlist` |
| `GET /api/admin/riders` | `app/api/admin/riders/route.ts` | List rider profiles/applications/documents for review. | `rider_profiles`, `rider_applications`, `rider_documents` |
| `PATCH /api/admin/riders` | `app/api/admin/riders/route.ts` | Approve/reject/request more info for riders. | `rider_profiles`, `rider_applications`, `profiles`, `notifications` |
| `GET /api/admin/businesses` | `app/api/admin/businesses/route.ts` | List business KYC applications. | `business_profiles`, `business_documents` |
| `PATCH /api/admin/businesses` | `app/api/admin/businesses/route.ts` | Approve, pause, reject business KYC. | `business_profiles`, `profiles`, `notifications` |
| `GET /api/admin/deliveries` | `app/api/admin/deliveries/route.ts` | List recent deliveries. | `deliveries`, joined `users`, `rider_profiles` |
| `PATCH /api/admin/deliveries` | `app/api/admin/deliveries/route.ts` | Update delivery timeline status. | `deliveries`, `delivery_events`, `delivery_locations`, `notifications`, rider wallet credit |
| `GET /api/admin/withdrawals` | `app/api/admin/withdrawals/route.ts` | List rider and wallet transaction withdrawals. | `withdrawal_requests`, `transactions`, `wallets` |
| `PATCH /api/admin/withdrawals` | `app/api/admin/withdrawals/route.ts` | Approve, reject, or mark withdrawals as paid. | `review_withdrawal_request`, `transactions`, `wallets`, `notifications` |
| `GET /api/admin/company-transactions` | `app/api/admin/company-transactions/route.ts` | List company ledger entries. | `company_transaction_logs` |
| `POST /api/admin/company-transactions` | `app/api/admin/company-transactions/route.ts` | Create company ledger entry. | `company_transaction_logs` |
| `PATCH /api/admin/company-transactions` | `app/api/admin/company-transactions/route.ts` | Update company ledger entry. | `company_transaction_logs` |
| `GET /api/admin/site-controls` | `app/api/admin/site-controls/route.ts` | Read admin-controlled site settings. | `platform_settings` |
| `PUT /api/admin/site-controls` | `app/api/admin/site-controls/route.ts` | Save admin-controlled site settings. | `platform_settings` |
| `GET /api/admin/risk-signals` | `app/api/admin/risk-signals/route.ts` | List risk/fraud signals. | `fraud_signals` |
| `POST/PATCH /api/admin/risk-signals` | `app/api/admin/risk-signals/route.ts` | Create/update risk signal actions. | `fraud_signals`, `support_tickets` |
| `GET /api/admin/restaurants` | `app/api/admin/restaurants/route.ts` | Read restaurant marketplace menu. | `platform_settings` |
| `PUT /api/admin/restaurants` | `app/api/admin/restaurants/route.ts` | Save restaurant marketplace menu. | `platform_settings` |
| `GET /api/admin/malls` | `app/api/admin/malls/route.ts` | Read mall marketplace menu. | `platform_settings` |
| `PUT /api/admin/malls` | `app/api/admin/malls/route.ts` | Save mall marketplace menu. | `platform_settings` |

### Customer and delivery routes

| Method and path | File | Purpose | Important tables/services |
| --- | --- | --- | --- |
| `GET /api/customer/dashboard` | `app/api/customer/dashboard/route.ts` | Load customer dashboard data. | `deliveries`, `notifications`, admin client |
| `POST /api/deliveries/checkout` | `app/api/deliveries/checkout/route.ts` | Create customer delivery and initialize wallet or Squad payment. | `deliveries`, `pay_delivery_from_wallet`, Squad |
| `GET /api/deliveries/verify` | `app/api/deliveries/verify/route.ts` | Verify Squad delivery payment. | Squad, `deliveries`, `delivery_events`, company ledger |
| `GET /api/tracking` | `app/api/tracking/route.ts` | Look up delivery by tracking code. | `deliveries`, joined rider/customer/location data |

### Rider routes

| Method and path | File | Purpose | Important tables/services |
| --- | --- | --- | --- |
| `POST /api/rider/applications` | `app/api/rider/applications/route.ts` | Submit rider KYC application. | `users`, `profiles`, `rider_applications`, `rider_profiles`, `rider_documents` |
| `GET /api/rider/availability` | `app/api/rider/availability/route.ts` | Load rider online/availability state. | `rider_profiles` |
| `POST/PATCH /api/rider/availability` | `app/api/rider/availability/route.ts` | Toggle rider online/offline and details. | `rider_profiles`, `rider_locations` |
| `GET /api/rider/jobs` | `app/api/rider/jobs/route.ts` | Load assigned and available jobs. | `deliveries`, `rider_profiles` |
| `POST /api/rider/jobs` | `app/api/rider/jobs/route.ts` | Accept, decline, or advance a job. | `accept_delivery_offer`, `reject_delivery_offer`, `deliveries`, `delivery_events`, `orders` |
| `POST /api/rider/withdrawals` | `app/api/rider/withdrawals/route.ts` | Legacy rider withdrawal request route. | `create_withdrawal_request`, `notifications` |

### Business routes

| Method and path | File | Purpose | Important tables/services |
| --- | --- | --- | --- |
| `GET /api/business/orders` | `app/api/business/orders/route.ts` | Load business orders. | `orders`, `business_profiles` |
| `PATCH /api/business/orders` | `app/api/business/orders/route.ts` | Update business order status. | `orders`, `notifications` |
| `POST /api/business/dispatch` | `app/api/business/dispatch/route.ts` | Create one business dispatch and pay from wallet. | `business_profiles`, `deliveries`, `pay_delivery_from_wallet`, company ledger |
| `POST /api/business/dispatch/bulk` | `app/api/business/dispatch/bulk/route.ts` | Create multiple business dispatches. | `deliveries`, wallet balance, `pay_delivery_from_wallet` |
| `GET/POST/PATCH /api/business/team` | `app/api/business/team/route.ts` | Manage business team members. | `business_team_members`, `notifications` |

### Marketplace routes

| Method and path | File | Purpose | Important tables/services |
| --- | --- | --- | --- |
| `GET /api/marketplace/restaurants` | `app/api/marketplace/restaurants/route.ts` | Read restaurant menu. | `platform_settings`, fallback menu |
| `GET /api/marketplace/malls` | `app/api/marketplace/malls/route.ts` | Read mall menu. | `platform_settings`, fallback menu |
| `POST /api/marketplace/estimate` | `app/api/marketplace/estimate/route.ts` | Estimate marketplace total. | `lib/marketplace-pricing.ts` |
| `POST /api/marketplace/checkout` | `app/api/marketplace/checkout/route.ts` | Create marketplace order/delivery and initialize Squad. | `orders`, `deliveries`, Squad |
| `GET /api/marketplace/verify` | `app/api/marketplace/verify/route.ts` | Verify Squad marketplace payment. | Squad, `orders`, `deliveries`, wallet credit/company ledger |

### Wallet and Squad routes

| Method and path | File | Purpose | Important tables/services |
| --- | --- | --- | --- |
| `GET /api/payments/banks` | `app/api/payments/banks/route.ts` | Get Nigerian bank list, with fallback banks. | Squad |
| `GET /api/payments/resolve-account` | `app/api/payments/resolve-account/route.ts` | Resolve bank account name. | Squad |
| `POST /api/wallet/topup` | `app/api/wallet/topup/route.ts` | Create wallet funding transaction and initialize Squad. | `create_wallet_funding`, Squad |
| `GET /api/wallet/verify` | `app/api/wallet/verify/route.ts` | Verify Squad funding and credit wallet once. | `complete_wallet_funding`, `mark_wallet_funding_failed` |
| `GET /api/wallet/transactions` | `app/api/wallet/transactions/route.ts` | List wallet transactions. | `wallets`, `transactions` |
| `GET /api/wallet/withdrawals` | `app/api/wallet/withdrawals/route.ts` | List user withdrawal requests. | `wallets`, `transactions` |
| `POST /api/wallet/withdrawals` | `app/api/wallet/withdrawals/route.ts` | Request rider/business withdrawal. | `wallets`, `transactions`, `notifications` |
| `POST /api/wallet/settle-delivery` | `app/api/wallet/settle-delivery/route.ts` | Credit rider earning after delivered job. | `creditRiderDeliveryWallet` |
| `GET /api/wallet/daily-commission` | `app/api/wallet/daily-commission/route.ts` | Deduct daily rider/business commissions through Vercel Cron. | `wallets`, `transactions`, `notifications`, `CRON_SECRET` |

### Maps routes

| Method and path | File | Purpose | Important services |
| --- | --- | --- | --- |
| `GET /api/maps/distance` | `app/api/maps/distance/route.ts` | Distance Matrix lookup. | Google Maps |
| `GET /api/maps/place-details` | `app/api/maps/place-details/route.ts` | Place details lookup. | Google Places API New |
| `POST /api/maps/address-autocomplete` | `app/api/maps/address-autocomplete/route.ts` | Address autocomplete. | Google Places API New |
| `GET /api/maps/reverse-geocode` | `app/api/maps/reverse-geocode/route.ts` | Lat/lng to address. | Google Geocoding |

### Uploads, site controls, health, auth helper routes

| Method and path | File | Purpose | Important tables/services |
| --- | --- | --- | --- |
| `POST /api/uploads` | `app/api/uploads/route.ts` | Upload profile photos, rider docs, business docs. | Supabase Storage |
| `GET /api/site-controls` | `app/api/site-controls/route.ts` | Public-safe site controls, currently brand partners. | `platform_settings` |
| `GET /api/health/readiness` | `app/api/health/readiness/route.ts` | Production readiness checks. | Env vars, Supabase, Squad |

## 10. Database And Storage Map

The main schema lives in `supabase-schema.sql`.

### Core identity tables

| Table | Purpose |
| --- | --- |
| `users` | App-level user profile tied to `auth.users`. Stores role, name, phone, email, default zone, avatar. |
| `profiles` | Alternate profile table used by dashboards/middleware. Stores account type, admin flag, KYC status, soft delete. |

The trigger `handle_new_auth_user()` creates/updates rows in both `users` and `profiles` when Supabase Auth creates a user.

### Rider tables

| Table | Purpose |
| --- | --- |
| `rider_profiles` | Rider operational profile: KYC status, account type, vehicle, bank details, rating, online status, suspension info. |
| `rider_applications` | Submitted rider onboarding form and documents JSON. |
| `rider_documents` | Individual rider document rows linked to `rider_profiles`. |
| `rider_locations` | Current rider live location. |

### Business tables

| Table | Purpose |
| --- | --- |
| `business_profiles` | Business KYC and operations profile. |
| `business_documents` | Business KYC uploaded documents. |
| `business_team_members` | Team invites/roles for a business profile. |

### Delivery and marketplace tables

| Table | Purpose |
| --- | --- |
| `deliveries` | Core logistics delivery jobs. Used by customer booking, business dispatch, marketplace delivery fallback, tracking, riders, admins. |
| `delivery_events` | Timeline events for each delivery. |
| `delivery_locations` | Current live location for a delivery/order. |
| `orders` | Marketplace/business order flow. Can link to a delivery. |
| `saved_addresses` | User saved pickup/dropoff addresses. |

### Wallet and finance tables

| Table | Purpose |
| --- | --- |
| `wallets` | Wallet balance per user and wallet type. Wallet types include `customer`, `rider`, `platform`. |
| `transactions` | Wallet funding, delivery payments, rider earnings, withdrawals, refunds, commissions. |
| `withdrawal_requests` | Legacy rider withdrawal review table. Some newer withdrawal flows use `transactions` metadata. |
| `company_transaction_logs` | Company ledger entries for income/expenses/transfers. |
| `pricing_rules` | Database pricing rules table. Current app fare logic mostly uses `lib/fare.ts`, not this table. |

### Platform/support tables

| Table | Purpose |
| --- | --- |
| `platform_launch_states` | Which Nigerian states are active/live/beta/waitlist/paused. |
| `state_waitlist` | Waitlist signups by state. |
| `platform_settings` | JSON settings for site controls, marketplace menus, brand partners, wallet policy. |
| `notifications` | In-app notifications. |
| `promotions` | Active customer promotions. |
| `push_subscriptions` | Web push subscription storage. |
| `support_tickets` | Support cases. |
| `support_messages` | Conversation messages for support tickets. |
| `account_deletion_requests` | Account deletion requests and review status. |
| `fraud_signals` | Risk/fraud records for admin review. |

### Legacy tables

| Table | Purpose |
| --- | --- |
| `user_profiles` | Legacy static app profile table. |
| `delivery_orders` | Legacy static app delivery order table. |

These remain so old static HTML flows can keep working while the Next.js app is used.

### Important SQL functions

| Function | Purpose |
| --- | --- |
| `set_updated_at()` | Updates `updated_at` automatically. |
| `current_user_role()` | Returns the current signed-in user's role. Used by RLS. |
| `current_user_is_admin()` | Returns whether current signed-in user is admin. |
| `handle_new_auth_user()` | Creates app profile rows after Supabase Auth signup. |
| `ensure_wallet()` | Creates/returns wallet for user and wallet type. |
| `create_wallet_funding()` | Creates a pending wallet top-up transaction. |
| `complete_wallet_funding()` | Marks wallet funding successful and credits wallet once. |
| `mark_wallet_funding_failed()` | Marks wallet funding failed. |
| `pay_delivery_from_wallet()` | Debits customer wallet and marks delivery searching. |
| `assign_next_delivery_to_rider()` | Assigns a searching delivery to a rider. |
| `accept_delivery_offer()` | Rider accepts an available delivery. |
| `reject_delivery_offer()` | Rider rejects a delivery offer. |
| `create_withdrawal_request()` | Legacy rider withdrawal request with locked balance. |
| `review_withdrawal_request()` | Admin approves/rejects/pays legacy rider withdrawal. |
| `hard_delete_expired_accounts()` | Deletes accounts after soft-delete retention. |

### Important RLS idea

RLS means Supabase will only allow certain users to select/insert/update rows. The app sometimes uses:

- Signed-in user client: respects RLS and acts as the user.
- Admin service-role client: bypasses RLS and must only run on the server.

If you add a table, do not forget RLS policies. If you forget policies, normal users may be blocked or unsafe reads/writes may be allowed.

## 11. Main App Workflows

### 11.1 Customer booking workflow

Main UI:

- `app/book/page.tsx`
- `components/booking/booking-flow.tsx`

Backend:

- `POST /api/deliveries/checkout`
- `GET /api/deliveries/verify`

Main helper:

- `lib/fare.ts`
- `lib/company-ledger.ts`
- `lib/payments/callback-url.ts`

Database:

- `deliveries`
- `delivery_events`
- `wallets`
- `transactions`
- `company_transaction_logs`

Flow:

1. Customer opens `/book`.
2. The UI collects pickup, dropoff, contact, parcel, vehicle, speed, schedule, and payment method.
3. Fare is estimated using `estimateFare()` in `lib/fare.ts`.
4. The browser posts to `/api/deliveries/checkout`.
5. The route validates the payload and recalculates the fare on the server.
6. If totals do not match, the route rejects the checkout.
7. The route creates a row in `deliveries` with `status='pending_payment'`.
8. If payment method is wallet:
   - The route calls SQL RPC `pay_delivery_from_wallet`.
   - Supabase debits the customer wallet and changes the delivery to `searching`.
   - A `delivery_events` row is created.
   - A company ledger income row is recorded.
9. If payment method is card or transfer:
   - The route initializes Squad.
   - Squad sends user to `/delivery/callback`.
   - Callback page calls `/api/deliveries/verify`.
   - Verification checks Squad status and amount.
   - The delivery is marked paid/searching and ledger is recorded.

Where to change customer delivery pricing:

- Edit `lib/fare.ts`.
- Then check `components/booking/booking-flow.tsx`.
- Then check `app/api/deliveries/checkout/route.ts`.
- If wallet payment amount rules change, also check `supabase-schema.sql` function `pay_delivery_from_wallet()`.

### 11.2 Tracking workflow

Main UI:

- `app/track/page.tsx`
- `components/tracking/live-order-tracking.tsx`
- `components/realtime/use-live-delivery-tracking.ts`

Backend:

- `GET /api/tracking`

Database:

- `deliveries`
- `delivery_events`
- `delivery_locations`
- `rider_locations`

Flow:

1. User enters a tracking code.
2. UI calls `/api/tracking?code=...`.
3. The route loads delivery details and related rider/location information.
4. The tracking UI subscribes to realtime updates where available.
5. Rider dashboard updates `rider_locations` and `delivery_locations`.
6. Delivery status changes create timeline events in `delivery_events`.

Where to change tracking result shape:

- Edit `app/api/tracking/route.ts`.
- Update `components/tracking/live-order-tracking.tsx` if the response fields change.
- Update realtime helpers in `components/realtime/` if channel behavior changes.

### 11.3 Rider onboarding and KYC workflow

Main UI:

- `app/rider/onboarding/page.tsx`
- `components/onboarding/rider-onboarding-flow.tsx`

Backend:

- `POST /api/uploads`
- `POST /api/rider/applications`
- `GET/PATCH /api/admin/riders`

Database/storage:

- `users`
- `profiles`
- `rider_applications`
- `rider_profiles`
- `rider_documents`
- `rider-documents`
- `profile-photos`

Flow:

1. Rider signs in.
2. Rider opens `/rider/onboarding`.
3. UI collects personal info, vehicle info, bank info, agreement, and documents.
4. Files are uploaded through `/api/uploads`.
5. The application is submitted to `/api/rider/applications`.
6. The route validates phone/email/agreement and writes:
   - `users` role as rider.
   - `profiles.account_type` as rider.
   - `rider_applications` row with form data.
   - `rider_profiles` row with `application_status='submitted'`.
   - `rider_documents` rows.
7. Admin opens `/admin` and uses `/api/admin/riders`.
8. Admin approves/rejects/requests more info.
9. Approved riders can go online and accept jobs.

Where to change rider document requirements:

- Update `components/onboarding/rider-onboarding-flow.tsx`.
- Update document types in `app/api/rider/applications/route.ts`.
- Update `rider_documents` `document_type` check constraint in `supabase-schema.sql`.
- Update storage policies only if folder/path ownership changes.
- Test admin rider review after the change.

### 11.4 Rider job workflow

Main UI:

- `app/rider/dashboard/page.tsx`
- `components/rider/rider-dashboard.tsx`

Backend:

- `GET/PATCH /api/rider/availability`
- `GET/POST /api/rider/jobs`
- `POST /api/wallet/settle-delivery`

Database:

- `rider_profiles`
- `rider_locations`
- `deliveries`
- `delivery_events`
- `delivery_locations`
- `orders`
- `wallets`
- `transactions`

Flow:

1. Approved rider opens dashboard.
2. Rider toggles online.
3. Dashboard calls `/api/rider/jobs`.
4. The route loads:
   - Assigned jobs.
   - Available `searching` deliveries with matching vehicle type if rider is online and approved.
5. Rider accepts job:
   - `POST /api/rider/jobs` with action `accept`.
   - SQL RPC `accept_delivery_offer()` assigns the rider.
6. Rider declines job:
   - SQL RPC `reject_delivery_offer()` records that the rider rejected it.
7. Rider advances job:
   - Status follows `accepted -> rider_arrived -> picked_up -> in_transit -> delivered`.
   - Delivery events are inserted.
   - Linked business order status is synced when applicable.
8. When delivered:
   - Rider can trigger settlement.
   - Admin delivery update also credits rider wallet when marked delivered.

Where to change rider status flow:

- Update `statusFlow` in `app/api/rider/jobs/route.ts`.
- Update `delivery_status` enum in `supabase-schema.sql` if adding new statuses.
- Update `types/domain.ts` `DeliveryStatus`.
- Update admin route `app/api/admin/deliveries/route.ts`.
- Update UI components that display statuses.
- Update RLS/policies if status-specific access changes.

### 11.5 Business registration and dispatch workflow

Main UI:

- `app/business/register/page.tsx`
- `components/onboarding/business-registration-flow.tsx`
- `app/business/dashboard/page.tsx`
- `components/dashboard/business-dashboard.tsx`

Backend:

- Business registration mostly writes through Supabase client from the component.
- `GET/PATCH /api/admin/businesses`
- `GET/PATCH /api/business/orders`
- `POST /api/business/dispatch`
- `POST /api/business/dispatch/bulk`
- `GET/POST/PATCH /api/business/team`

Database/storage:

- `business_profiles`
- `business_documents`
- `business_team_members`
- `orders`
- `deliveries`
- `wallets`
- `transactions`
- `business-documents`

Flow:

1. Business user signs in.
2. Business registers through `/business/register`.
3. Business profile and docs are saved.
4. Admin reviews the business in `/admin`.
5. Admin changes `business_profiles.registration_status`.
6. Active businesses can create dispatches.
7. Business dispatch creates a delivery and pays by wallet.
8. Bulk dispatch checks wallet balance and creates multiple paid deliveries.

Where to change business KYC fields:

- Update `components/onboarding/business-registration-flow.tsx`.
- Update `business_profiles` or `business_documents` in `supabase-schema.sql`.
- Update `app/api/admin/businesses/route.ts`.
- Update admin UI in `components/admin/admin-panel.tsx`.

### 11.6 Marketplace workflow

Main UI:

- `app/restaurants/page.tsx`
- `app/restaurants/[kitchenId]/page.tsx`
- `app/shopping-mall/page.tsx`
- `components/marketplace/order-marketplace.tsx`
- `components/marketplace/mall-marketplace.tsx`
- `components/marketplace/use-marketplace-estimate.ts`

Backend:

- `GET /api/marketplace/restaurants`
- `GET /api/marketplace/malls`
- `POST /api/marketplace/estimate`
- `POST /api/marketplace/checkout`
- `GET /api/marketplace/verify`
- `GET/PUT /api/admin/restaurants`
- `GET/PUT /api/admin/malls`

Helpers:

- `lib/restaurant-menu.ts`
- `lib/mall-menu.ts`
- `lib/marketplace-pricing.ts`
- `lib/wallet-ledger.ts`

Database:

- `platform_settings`
- `orders`
- `deliveries`
- `wallets`
- `transactions`

Flow:

1. Marketplace UI loads restaurant/mall data from public API routes.
2. Menu data comes from `platform_settings`, with fallback default menu files.
3. User adds items and enters delivery address.
4. UI calls `/api/marketplace/estimate`.
5. Checkout posts to `/api/marketplace/checkout`.
6. If items are tied to one active registered business:
   - The route creates an `orders` row.
   - Business receives notification.
7. If no active linked business:
   - The route creates a `deliveries` row as a marketplace delivery fallback.
8. Squad payment is initialized.
9. Callback page calls `/api/marketplace/verify`.
10. Verification either:
   - Credits the business order wallet for goods amount.
   - Or marks marketplace delivery payment successful and records company ledger income.

Where to change marketplace fees:

- Edit `lib/marketplace-pricing.ts`.
- Update `components/marketplace/use-marketplace-estimate.ts` if displayed fields change.
- Update `app/api/marketplace/checkout/route.ts`.
- Update `app/api/marketplace/verify/route.ts` if credited amounts or metadata change.

### 11.7 Wallet top-up workflow

Main UI:

- `components/wallet/wallet-card.tsx`
- `components/wallet/smart-wallet-top-up.tsx`
- `app/wallet/callback/page.tsx`

Backend:

- `POST /api/wallet/topup`
- `GET /api/wallet/verify`

Database:

- `wallets`
- `transactions`
- SQL RPC functions in `supabase-schema.sql`

Flow:

1. User enters top-up amount.
2. UI posts to `/api/wallet/topup`.
3. Route validates amount and wallet type.
4. Route calls SQL RPC `create_wallet_funding()`.
5. Route initializes Squad.
6. User pays on Squad.
7. Squad redirects to `/wallet/callback`.
8. Callback page calls `/api/wallet/verify`.
9. Route verifies Squad amount/status.
10. Route calls SQL RPC `complete_wallet_funding()`.
11. SQL function credits wallet only once.

Where to change minimum top-up:

- Update `app/api/wallet/topup/route.ts`.
- Update `supabase-schema.sql` function `create_wallet_funding()`.
- Update `app/api/admin/site-controls/route.ts` default `wallet_policy`.
- Update UI text if any component shows the minimum.

### 11.8 Withdrawal workflow

Main UI:

- `components/rider/rider-dashboard.tsx`
- `components/wallet/transaction-history.tsx`
- Admin withdrawal UI in `components/admin/admin-panel.tsx`

Backend:

- `GET/POST /api/wallet/withdrawals`
- `POST /api/rider/withdrawals`
- `GET/PATCH /api/admin/withdrawals`

Database:

- `wallets`
- `transactions`
- `withdrawal_requests`

Flow:

1. Rider or business requests a withdrawal.
2. Newer route `/api/wallet/withdrawals` creates a `transactions` row with:
   - `transaction_type='withdrawal'`
   - `provider='manual_admin_payout'`
   - negative `amount_ngn`
   - metadata containing bank details and account kind.
3. Wallet balance decreases.
4. Wallet locked balance increases.
5. Admin loads withdrawals from both:
   - `withdrawal_requests`
   - `transactions`
6. Admin approves, rejects, or marks paid.
7. If rejected:
   - Funds return to available balance.
   - Locked balance decreases.
8. If paid:
   - Transaction is successful.
   - Locked balance decreases.

Where to change withdrawal limits:

- Update constants in `lib/wallet-ledger.ts`:
  - `MIN_WITHDRAWAL_NGN`
  - `MAX_WITHDRAWAL_NGN`
  - `PAYOUT_SLA_HOURS`
- Update `app/api/wallet/withdrawals/route.ts`.
- Update `supabase-schema.sql` constraints and `create_withdrawal_request()` if legacy route remains supported.
- Update `app/api/admin/site-controls/route.ts` wallet policy defaults.
- Update UI copy where shown.

### 11.9 Admin site controls workflow

Main UI:

- `components/admin/admin-panel.tsx`
- Landing UI uses public site controls in `components/landing/launch-landing-page.tsx`

Backend:

- `GET /api/site-controls`
- `GET/PUT /api/admin/site-controls`

Database:

- `platform_settings` row with key `admin_site_controls`

Site controls can include:

- Bookings enabled.
- Rider onboarding enabled.
- Wallet top-ups enabled.
- Withdrawals enabled.
- Support status.
- Launch headline.
- Launch message.
- Brand partners.
- Wallet policy.

Note: Some controls are stored, but every feature must explicitly read/enforce the control before it actually blocks behavior. If you add a new control, make sure both UI and backend routes enforce it.

## 12. Backend Change Playbooks

Use these playbooks when changing essential backend functionality.

### 12.1 Before changing any backend behavior

Do this first:

1. Find the API route in `app/api`.
2. Find any helper in `lib/`.
3. Find the tables and SQL functions in `supabase-schema.sql`.
4. Find the frontend component that calls the route.
5. Check whether the route uses:
   - `createClient()` from `lib/supabase/server.ts`
   - `createAdminClient()` from `lib/supabase/admin.ts`
   - SQL RPC functions
   - Squad
   - Google Maps
6. Decide whether the change belongs in:
   - UI only.
   - API route validation.
   - Shared helper.
   - Database schema.
   - SQL RPC function.
   - RLS policy.
7. Make the smallest change that correctly covers the full workflow.
8. Run typecheck/build or at least test the affected route manually.

### 12.2 How to add a new API route

1. Create a folder under `app/api`.
2. Add `route.ts`.
3. Export a method function:

```ts
export async function GET(request: Request) {
  // ...
}

export async function POST(request: Request) {
  // ...
}
```

4. Validate all input from `request.json()` or query params.
5. Authenticate the user if needed:

```ts
const supabase = await createClient();
const {
  data: { user }
} = await supabase.auth.getUser();

if (!user) {
  return NextResponse.json({ error: "Please sign in." }, { status: 401 });
}
```

6. Use `createAdminClient()` only for server-only actions that need service-role access.
7. Return JSON with clear errors:

```ts
return NextResponse.json({ error: "Helpful message." }, { status: 400 });
```

8. If the route changes money, status, KYC, or permissions, add/update database protections too.

### 12.3 How to change pricing or fare calculation

Files:

- `lib/fare.ts`
- `lib/marketplace-pricing.ts`
- `app/api/deliveries/checkout/route.ts`
- `app/api/marketplace/estimate/route.ts`
- `app/api/marketplace/checkout/route.ts`
- `components/booking/booking-flow.tsx`
- `components/marketplace/use-marketplace-estimate.ts`

Rules:

- Never trust the frontend total. Always recalculate total on the server.
- If frontend total and server total differ, reject checkout.
- If adding zone/vehicle/surge rules, keep one source of truth in helper functions.
- If you decide to use the `pricing_rules` table, update server routes to read it and add fallback behavior.

### 12.4 How to change delivery statuses

Files:

- `types/domain.ts`
- `supabase-schema.sql`
- `app/api/rider/jobs/route.ts`
- `app/api/admin/deliveries/route.ts`
- `app/api/tracking/route.ts`
- `components/rider/rider-dashboard.tsx`
- `components/tracking/live-order-tracking.tsx`
- `components/admin/admin-panel.tsx`
- `components/ui/status-badge.tsx`

Steps:

1. Add status to TypeScript `DeliveryStatus`.
2. Add status to Postgres enum `public.delivery_status`.
3. Update allowed status sets in API routes.
4. Update rider status progression.
5. Update admin status controls.
6. Update status labels/badges.
7. Update tracking timeline display.
8. Test customer, rider, and admin views.

#### Secure delivery completion

The final handoff follows this status path:

`in_transit` → `awaiting_delivery_confirmation` → `delivered`

- The assigned rider can record arrival at the drop-off point but cannot mark the delivery completed.
- A six-digit PIN is generated only after arrival. It is encrypted at rest and separately authenticated with an HMAC digest.
- The booking customer can view the PIN or confirm the handoff directly inside the authenticated messenger.
- The assigned rider has five PIN attempts. PINs expire after 15 minutes and resends are rate-limited.
- `finalizeConfirmedDelivery()` is the only customer/rider completion path and triggers linked-order completion, fleet release, notifications, and idempotent rider settlement.
- Administrators retain an audited override for recipient-unavailable and support cases.

Production database rollout uses `supabase-delivery-confirmation-delta.sql`. Do not rerun the complete schema for this change.

### 12.5 How to change wallet rules

Files:

- `lib/wallet-ledger.ts`
- `supabase-schema.sql`
- `app/api/wallet/topup/route.ts`
- `app/api/wallet/verify/route.ts`
- `app/api/wallet/withdrawals/route.ts`
- `app/api/admin/withdrawals/route.ts`
- `app/api/wallet/daily-commission/route.ts`
- `components/wallet/*`
- `components/rider/rider-dashboard.tsx`

Rules:

- Balance changes should be idempotent.
- Payment verification must happen before crediting wallet.
- Use unique provider references to prevent duplicate credits.
- Money operations should happen in SQL RPC when possible.
- Never let a client directly update `wallets.balance_ngn`.
- When rejecting withdrawals, return funds correctly.
- When marking withdrawals paid, reduce locked balance correctly.

### 12.6 How to change Squad behavior

Files:

- `app/api/deliveries/checkout/route.ts`
- `app/api/deliveries/verify/route.ts`
- `app/api/marketplace/checkout/route.ts`
- `app/api/marketplace/verify/route.ts`
- `app/api/wallet/topup/route.ts`
- `app/api/wallet/verify/route.ts`
- `app/api/payments/banks/route.ts`
- `app/api/payments/resolve-account/route.ts`
- `lib/payments/callback-url.ts`
- `lib/payments/squad.ts`

Rules:

- Initialize payment on the server.
- Verify payment on the server.
- Check Squad status is successful.
- Compare Squad amount against expected amount.
- Use `SQUAD_SECRET_KEY` only on the server.
- Do not mark an order paid from the callback page alone. The callback page must call a verification route.
- Keep callback URLs aligned with `NEXT_PUBLIC_SITE_URL`, `PAYMENT_CALLBACK_ORIGIN`, or `SQUAD_CALLBACK_ORIGIN`.

### 12.7 How to change KYC approval behavior

Rider files:

- `app/api/rider/applications/route.ts`
- `app/api/admin/riders/route.ts`
- `components/onboarding/rider-onboarding-flow.tsx`
- `components/admin/admin-panel.tsx`
- `supabase-schema.sql`

Business files:

- `components/onboarding/business-registration-flow.tsx`
- `app/api/admin/businesses/route.ts`
- `components/admin/admin-panel.tsx`
- `supabase-schema.sql`

Rules:

- Keep application table and profile table in sync.
- When approving a rider, ensure `rider_profiles.application_status='approved'`.
- When approving a business, ensure `business_profiles.registration_status='active'`.
- Update `profiles.kyc_status` so dashboard display matches admin decision.
- Insert a notification so the user knows the result.
- If adding new document types, update database constraints and storage upload handling.

### 12.8 How to add a new database column

1. Add `alter table ... add column if not exists ...` in `supabase-schema.sql`.
2. If it needs validation, add or update a check constraint.
3. If it needs an index, add `create index if not exists`.
4. If users need access, update RLS policies.
5. Update TypeScript code that reads/writes the table.
6. Update admin UI if admins need to view/edit the field.
7. Rerun `supabase-schema.sql` in Supabase SQL Editor.
8. Test both existing rows and new rows.

### 12.9 How to add a new table

1. Add `create table if not exists public.table_name (...)`.
2. Add `updated_at` trigger if rows are edited.
3. Enable RLS:

```sql
alter table public.table_name enable row level security;
```

4. Add policies for select/insert/update/delete.
5. Add indexes.
6. Add foreign keys.
7. Add API routes or helpers that use the table.
8. Do not use service-role for normal user operations unless absolutely necessary.
9. Add route tests/manual smoke checks.

### 12.10 How to change launch state behavior

Files:

- `lib/launch-states.ts`
- `app/api/admin/states/route.ts`
- `components/admin/admin-panel.tsx`
- `components/waitlist/join-state-waitlist-button.tsx`
- `app/book/page.tsx`
- `app/rider/onboarding/page.tsx`
- `supabase-schema.sql`

Rules:

- Default live states are Lagos and Ogun in `lib/launch-states.ts`.
- Database live states are stored in `platform_launch_states`.
- Waitlist interest is stored in `state_waitlist`.
- Admin state changes should update both launch state and waitlist status where needed.

### 12.11 How to change marketplace menu data

Files:

- `lib/restaurant-menu.ts`
- `lib/mall-menu.ts`
- `app/api/admin/restaurants/route.ts`
- `app/api/admin/malls/route.ts`
- `app/api/marketplace/restaurants/route.ts`
- `app/api/marketplace/malls/route.ts`
- `components/admin/admin-panel.tsx`
- `components/marketplace/*`

Storage:

- Menu data is saved in `platform_settings`.

Rules:

- Keep fallback menu data valid.
- Normalize menu data before returning it.
- When admin saves menu data, validate shape before writing.
- If menu items link to real businesses, keep `businessId` and business profile status logic aligned with checkout route.

### 12.12 How to change admin permissions

Files:

- `lib/admin-auth.ts`
- `app/api/admin/_auth.ts`
- `app/api/admin/login/route.ts`
- `middleware.ts`
- `supabase-schema.sql`

Rules:

- Every `/api/admin/*` route should call `requireAdminSession()`.
- Keep admin cookie HTTP-only.
- Require the configured `FASTFLEET_ADMIN_USER_ID` to have `profiles.is_admin=true`.
- Pass mutating requests into `requireAdminSession(request)` so same-origin enforcement runs.
- Do not expose admin-only data through public routes.

### 12.13 How to change file upload behavior

Files:

- `app/api/uploads/route.ts`
- `lib/storage.ts`
- `components/onboarding/rider-onboarding-flow.tsx`
- `components/onboarding/business-registration-flow.tsx`
- `supabase-schema.sql`

Rules:

- Max upload size is currently 7 MB in `/api/uploads`.
- Upload kinds are:
  - `profile-photo`
  - `rider-document`
  - `business-document`
- Server route creates missing buckets if needed.
- Storage paths include the user id to support ownership policies.
- If changing bucket names, update storage policies in `supabase-schema.sql`.

### 12.14 How to add emails or push notifications

Current notification storage:

- `notifications`
- `push_subscriptions`

Helpers:

- `lib/notifications.ts`

Rules:

- In-app notifications are rows in `notifications`.
- Supabase Auth confirmation emails are configured in Supabase Auth SMTP settings, not in this app.
- If adding transactional app-owned email, create a server route or server helper and use `RESEND_API_KEY` server-side only.
- Do not send email directly from client components.

## 13. Admin And Security Rules

### Server-only keys

These keys must never reach the browser:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SQUAD_SECRET_KEY`
- `FASTFLEET_ADMIN_PASSWORD`
- `FASTFLEET_ADMIN_SECRET`
- `CRON_SECRET`
- OAuth provider secrets

### When to use each Supabase client

Use `lib/supabase/client.ts` when:

- You are inside a client component.
- The operation is safe for the current signed-in user.
- RLS policies allow it.

Use `lib/supabase/server.ts` when:

- You are inside a server component or route.
- You need the current signed-in user from cookies.
- The operation should respect the user's auth context.

Use `lib/supabase/admin.ts` when:

- You are inside server-only code.
- You need service-role access.
- You are doing admin review, secure uploads, server joins, payment verification, or trusted background work.

Never import `createAdminClient()` into a client component.

### Input validation rules

Every API route should:

- Parse input safely.
- Trim strings.
- Validate enum-like values with sets.
- Reject missing required fields.
- Recalculate totals on the server.
- Return clear error messages.
- Avoid leaking secrets in errors.

### Payment safety rules

Never trust:

- Frontend totals.
- Callback query params.
- User-provided payment status.

Always trust:

- Server recalculation.
- Squad verification API.
- SQL RPC functions that lock rows and prevent duplicate updates.

## 14. Payments, Wallet, And Withdrawal Rules

### Payment statuses

Delivery payment flow uses:

- `pending_payment`
- `searching`
- Later delivery timeline statuses.

Wallet transaction statuses use:

- `pending`
- `successful`
- `failed`
- `reversed`

Marketplace orders use:

- `payment_status='pending'`
- `payment_status='paid'`

### Transaction types

The `transactions.transaction_type` check allows:

- `wallet_funding`
- `delivery_payment`
- `rider_earning`
- `withdrawal`
- `refund`
- `commission`

### Wallet types

The `wallets.wallet_type` check allows:

- `customer`
- `rider`
- `platform`

Business wallets currently use the `customer` wallet type with metadata/account kind identifying business use in newer flows.

### Commission rules

Daily commission route:

- `app/api/wallet/daily-commission/route.ts`

Commission basis:

- Daily commission is calculated from new earnings credited on the Lagos business date, not from the full wallet balance.
- If new earnings are zero, no commission is deducted.
- Rider commission:
  - independent: 10 percent
  - fastfleets360: 5 percent
- Business commission:
  - Pharmacy: 5 percent
  - Restaurant and every other supported business category: 10 percent
- `business_profiles.commission_rate` is reconciled against these rules by the daily commission route before a deduction is made.

Authorization:

- `CRON_SECRET` is required and must be a strong random value of at least 32 characters.
- Vercel Cron sends it automatically, and every request must include:

```text
Authorization: Bearer your-cron-secret
```

### Rider earning rules

Rider earnings are credited by:

- `creditRiderDeliveryWallet()` in `lib/wallet-ledger.ts`
- `POST /api/wallet/settle-delivery`
- Admin delivery route when status becomes `delivered`

The helper prevents duplicate credit by checking a unique provider reference like:

```text
delivery-code-rider-earning
```

## 15. Realtime Tracking And Maps

### Realtime

Realtime-related files:

- `lib/realtime.ts`
- `components/realtime/use-live-delivery-tracking.ts`
- `components/realtime/tracking-console.tsx`
- `components/realtime/delivery-details-console.tsx`
- `components/tracking/live-order-tracking.tsx`
- `components/rider/rider-dashboard.tsx`

Tables involved:

- `deliveries`
- `delivery_events`
- `rider_locations`
- `delivery_locations`

If live updates stop working:

1. Check Supabase Realtime is enabled for the table.
2. Check RLS policies allow the signed-in user to read the row.
3. Check the client subscribed to the right channel/table/filter.
4. Check that route/component writes location/status updates.

### Maps

Maps-related files:

- `app/api/maps/distance/route.ts`
- `app/api/maps/place-details/route.ts`
- `app/api/maps/address-autocomplete/route.ts`
- `app/api/maps/reverse-geocode/route.ts`
- `components/location/address-autocomplete-input.tsx`
- `components/maps/route-preview.tsx`
- `components/landing/live-location-map.tsx`
- `components/tracking/live-order-tracking.tsx`
- `lib/maps/google-api.ts`

Google key variables:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_PLACES_API_KEY`

If Google Places errors mention Places API New, enable Places API New in Google Cloud or set `GOOGLE_PLACES_API_KEY` to a server key that has the correct API enabled.

## 16. Deployment And Production Checklist

### Production must deploy the Next.js app

Do not deploy only static HTML files. The app depends on:

- Middleware.
- API routes.
- Server cookies.
- Supabase SSR.
- Payment callbacks.
- Secure server-side service role operations.

Deploy the full Next.js project to a compatible host.

### Production environment

Set:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-production-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-production-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key
FASTFLEET_ADMIN_USERNAME=your-admin-username
FASTFLEET_ADMIN_PASSWORD=your-strong-admin-password
FASTFLEET_ADMIN_SECRET=your-random-secret-of-at-least-32-characters
FASTFLEET_ADMIN_USER_ID=your-supabase-admin-user-uuid
SQUAD_SECRET_KEY=your-live-squad-secret
SQUAD_BASE_URL=https://api-d.squadco.com
SQUAD_CALLBACK_ORIGIN=https://your-domain.com
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-key
NEXT_PUBLIC_SITE_URL=https://your-domain.com
NEXT_PUBLIC_ALLOW_DEMO_DATA=false
NEXT_PUBLIC_ALLOW_SUPABASE_FALLBACK=false
```

Required:

```bash
CRON_SECRET=replace-with-a-random-secret-at-least-32-characters
```

### Production go-live checks

1. Run full `supabase-schema.sql`.
2. Confirm storage buckets exist.
3. Confirm realtime tables are enabled.
4. Confirm Supabase Auth redirect URLs.
5. Confirm Squad callback and redirect URLs.
6. Confirm Google Maps APIs.
7. Confirm admin login.
8. Confirm `/api/health/readiness`.
9. Run a test customer booking.
10. Run a test wallet top-up.
11. Run a test rider onboarding.
12. Approve rider from admin.
13. Create delivery, accept as rider, advance to delivered.
14. Confirm rider wallet earning.
15. Request withdrawal and review from admin.
16. Create a support ticket.
17. Check production logs for errors.

## 17. Testing And Verification Checklist

### Code checks

Run:

```bash
npm run typecheck
npm run build
```

If `npm run lint` is configured correctly for your Next.js version, also run:

```bash
npm run lint
```

### Manual workflow checks

Customer:

- Sign up/sign in.
- Choose customer account.
- Book delivery.
- Pay by wallet.
- Pay by Squad sandbox card/transfer.
- Track delivery.
- Check dashboard.

Rider:

- Sign up/sign in.
- Submit onboarding.
- Upload documents.
- Admin approves KYC.
- Go online.
- Accept job.
- Advance job to delivered.
- Upload proof.
- Confirm wallet earning.
- Request withdrawal.

Business:

- Register business.
- Upload documents.
- Admin approves business.
- Create dispatch.
- Create bulk dispatch.
- Check business orders.
- Request withdrawal if wallet is funded.

Admin:

- Log in.
- Load all panels.
- Launch/pause state.
- Approve/reject rider.
- Approve/reject business.
- Update delivery status.
- Review withdrawal.
- Edit site controls.
- Edit restaurant/mall menus.
- Create/update company transaction log.

Payments:

- Squad initialize works.
- Squad verify works.
- Wrong amount is rejected.
- Duplicate verification does not double-credit wallet.
- Missing `SQUAD_SECRET_KEY` gives a clear server error.

Storage:

- Profile photo uploads.
- Rider document uploads.
- Business document uploads.
- Delivery proof uploads.

Realtime:

- Delivery status changes appear in tracking.
- Rider location updates appear where expected.

## 18. Troubleshooting Guide

### App says Supabase env vars are missing

Check:

- `.env.local` exists.
- `NEXT_PUBLIC_SUPABASE_URL` is set.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set.
- Restart `npm run dev` after changing env vars.

### Admin actions say service role key is missing

Check:

- `SUPABASE_SERVICE_ROLE_KEY` is set.
- You are deploying the Next.js server, not static files only.
- The code path is server-side.

### User is redirected to `/auth`

Reason:

- The route is protected by `middleware.ts`.
- User is not signed in or session cookie is missing.

Fix:

- Sign in again.
- Check Supabase Auth callback URLs.
- Check `NEXT_PUBLIC_SUPABASE_URL` and anon key.

### User lands on wrong dashboard

Check:

- `profiles.account_type`
- `users.role`
- `lib/auth/roles.ts`
- `middleware.ts`
- `app/auth/callback/route.ts`
- `app/auth/confirm/route.ts`

### Wallet top-up does not credit balance

Check:

- Squad verification route was called.
- Squad returned a successful status.
- Amount in kobo matches expected NGN amount times 100.
- `complete_wallet_funding()` exists in Supabase.
- `transactions.provider_reference` is unique.
- User is still signed in during verification.

### Delivery checkout says total changed

Reason:

- Frontend total does not match server recalculation.

Check:

- `lib/fare.ts`
- `components/booking/booking-flow.tsx`
- `app/api/deliveries/checkout/route.ts`

### Rider cannot see available jobs

Check:

- Rider has approved KYC.
- `rider_profiles.application_status='approved'`.
- Rider is online.
- Delivery status is `searching`.
- Delivery has no `rider_id`.
- Delivery vehicle type matches rider vehicle type.
- Rider has not rejected the job already.

### Admin cannot approve rider/business

Check:

- Admin cookie exists.
- `SUPABASE_SERVICE_ROLE_KEY` is set.
- API route calls `requireAdminSession()`.
- Supabase schema has required columns.
- `FASTFLEET_ADMIN_USER_ID` identifies an enabled Supabase Auth user whose non-deleted profile has `is_admin=true`.

### File upload fails

Check:

- User is signed in.
- `SUPABASE_SERVICE_ROLE_KEY` is set.
- File is under 7 MB.
- Bucket exists or can be created.
- Storage schema and policies from `supabase-schema.sql` have been run.
- Upload `kind` is one of `profile-photo`, `rider-document`, `business-document`.

### Google Maps fails

Check:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` exists for browser map.
- `GOOGLE_MAPS_API_KEY` exists for server distance/reverse-geocode.
- `GOOGLE_PLACES_API_KEY` exists for Places API New routes.
- APIs are enabled in Google Cloud.
- Billing is enabled in Google Cloud.
- Key restrictions allow the right domain/server.

### Production readiness endpoint fails

Open:

```text
/api/health/readiness
```

Check failed items in the JSON response.

Common causes:

- Missing env vars.
- Supabase service role key missing.
- Schema not fully run.
- Storage bucket missing.
- Squad key invalid.
- `NEXT_PUBLIC_SITE_URL` is not the expected production domain.

## 19. Known Maintenance Notes

### Readiness route table name check

`app/api/health/readiness/route.ts` checks for a critical table named `wallet_transactions`, but the current schema creates the wallet ledger table as `transactions`.

If readiness fails on `wallet_transactions`, decide whether to:

1. Update the readiness route to check `transactions`; or
2. Add/create a compatibility view/table named `wallet_transactions`.

Given the current app code, `transactions` is the active wallet transaction table.

### Admin site controls are not automatic feature gates everywhere

The admin site controls row stores flags like:

- `bookings_enabled`
- `rider_onboarding_enabled`
- `wallet_topups_enabled`
- `withdrawals_enabled`

But a flag only blocks a feature if the relevant page or API route reads and enforces it. If you add or rely on a flag, make sure the backend route checks it.

### Pricing rules table is not the current fare source of truth

The schema has `pricing_rules`, but current fare calculation is in `lib/fare.ts`. If you want database-managed pricing, update the backend routes to read `pricing_rules`, add caching/fallback behavior, and keep server-side recalculation.

### Business wallet uses customer wallet type

Current helper `walletTypeForAccountKind()` maps:

- rider -> rider wallet
- business -> customer wallet
- customer -> customer wallet

This means business wallet behavior depends on transaction metadata/account kind. If you want a separate business wallet type, update:

- `wallets.wallet_type` check constraint.
- `types/domain.ts`.
- `lib/wallet-ledger.ts`.
- Wallet API routes.
- Admin withdrawal route.
- UI wallet components.

## 20. Glossary

| Term | Meaning |
| --- | --- |
| API route | A server endpoint in `app/api/**/route.ts`. |
| App Router | Next.js routing system using the `app/` folder. |
| Anon key | Supabase public browser-safe key. It still respects RLS. |
| Service role key | Supabase secret admin key. Bypasses RLS. Server only. |
| RLS | Row Level Security, Supabase/Postgres rules controlling row access. |
| RPC | Remote procedure call. In this app, SQL functions called from Supabase. |
| KYC | Know Your Customer. Identity/business verification process. |
| Delivery | A logistics job in the `deliveries` table. |
| Order | A marketplace/business order in the `orders` table. |
| Wallet | User balance row in `wallets`. |
| Transaction | Wallet ledger row in `transactions`. |
| Locked balance | Funds reserved while withdrawal is pending/approved but not paid. |
| Squad reference | Unique payment reference used to initialize and verify payments. |
| Platform settings | JSON configuration stored in `platform_settings`. |
| Launch state | Nigerian state availability stored in `platform_launch_states`. |
| Admin session cookie | HTTP-only cookie used to protect admin APIs. |

## Final Maintainer Advice

When changing backend functionality, always trace the whole workflow. For example, changing a delivery status is not only a UI change. It can affect TypeScript types, API validation, SQL enums, rider job progression, admin controls, tracking, notifications, wallet settlement, and business order sync.

The safest pattern is:

1. Understand the workflow.
2. Change the shared helper or schema first if it is the real source of truth.
3. Update API validation.
4. Update UI display.
5. Run checks.
6. Manually test the full user journey.

If money, KYC, permissions, uploads, or admin power are involved, slow down and verify every layer.
