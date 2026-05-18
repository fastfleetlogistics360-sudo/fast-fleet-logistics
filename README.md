# FastFleet Logistics

FastFleet is a premium logistics marketplace for Lagos and Ogun State dispatch operations. The original static HTML/CSS/JS pages are preserved in the project root as a legacy fallback, while the upgraded production app now lives in the Next.js `app/`, `components/`, `lib/`, and `types/` structure.

## Stack

- Next.js 15+
- TypeScript
- TailwindCSS
- Framer Motion
- Supabase Auth, Database, Storage, and Realtime
- PWA manifest and service worker

## Run

```bash
npm install
npm run dev
```

## Cloudflare Pages

Do not upload the whole project folder to Cloudflare Pages. The working folder contains `node_modules` and local build/cache files, which can easily push the upload over Cloudflare's 1,000-file direct upload limit.

For drag-and-drop Cloudflare Pages hosting, run:

```bash
npm run cloudflare:pack
```

Upload the generated `cloudflare-pages/` folder. It contains only the production static pages, assets, CSS, JavaScript, redirects, sitemap, and robots file, and the script fails if the folder ever goes above 1,000 files.

For the full Next.js app with server routes, use a Git-based Cloudflare Pages setup or a Next-compatible Cloudflare adapter so dependencies are installed during Cloudflare's build step rather than uploaded.

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FASTFLEET_ADMIN_USERNAME=FastFleetAdmin
FASTFLEET_ADMIN_PASSWORD="Fastfleet360@#"
FASTFLEET_ADMIN_SECRET=change-this-long-random-secret
PAYSTACK_SECRET_KEY=sk_test_or_live_xxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=optional-google-maps-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Run `supabase-schema.sql` in the Supabase SQL editor before testing live auth, orders, rider documents, wallets, withdrawals, notifications, and admin operations.

## Soft Launch Setup

FastFleet is open for Lagos and Ogun first. During registration, users can choose any Nigerian state. Users outside live states can register, but their dashboard shows the state waitlist screen and stores their interest in `state_waitlist`.

The admin panel includes every Nigerian state with a `Go live` button. When a state is launched, `platform_launch_states` is updated and users from that state automatically see the full customer or rider dashboard.

## Wallet and Paystack

Wallet top-up is wired through server routes:

- `POST /api/wallet/topup` initializes a Paystack payment.
- `GET /api/wallet/verify?reference=...` verifies the payment and credits the wallet once.
- `/wallet/callback` is the Paystack callback page.

Set `PAYSTACK_SECRET_KEY` in `.env.local`, and set `NEXT_PUBLIC_SITE_URL` to your deployed domain before going live.

## Admin Access

- Login URL: `/admin`
- Admin URL: `/admin`
- Username: `FastFleetAdmin`
- Password: `Fastfleet360@#`

The admin login is separate from customer and driver registration. Real admin actions such as state launch updates and withdrawal approvals require `SUPABASE_SERVICE_ROLE_KEY` in your server environment.

## Netlify

This folder contains both legacy static files and a Next.js production app. Netlify will detect Next.js when you upload the full folder because `package.json`, `next.config.ts`, and `app/` are present. Use the included `netlify.toml` for the Next.js app.

If you only want the old static `index.html` version, upload only the static files and folders: `index.html`, `auth.html`, `dashboard.html`, `driver.html`, `order.html`, `services.html`, `support.html`, `track.html`, `assets/`, `css/`, and `js/`.

## Key Routes

- `/` premium landing page
- `/auth` Supabase phone OTP and role selection
- `/book` multi-step customer booking flow
- `/track` realtime-ready delivery tracking
- `/dashboard` customer dashboard
- `/rider/onboarding` rider application and document uploads
- `/rider/dashboard` rider operations dashboard
- `/admin` admin operations panel
- `/support` support center

## Legacy Files

The original `index.html`, `order.html`, `track.html`, `dashboard.html`, `driver.html`, `support.html`, `services.html`, `css/`, and `js/` files remain untouched so existing demo behavior and fallback pages continue to work.
