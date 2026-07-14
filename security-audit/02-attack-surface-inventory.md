# Attack Surface Inventory

## Public Web Pages And App Routes

Representative pages include:

- Public/static: `/`, `/about`, `/main`, `/services`, `/privacy`, `/terms`, `/support`, `/track`, `/updates`.
- Auth/account: `/auth`, `/auth/callback`, `/auth/confirm`, `/choose-account-type`.
- Customer: `/book`, `/dashboard`, `/customer/dashboard`, `/account/orders/[orderId]/track`, `/account/orders/[orderId]/messenger`.
- Rider: `/rider/onboarding`, `/rider/dashboard`, `/rider/dashboard/[section]`.
- Business: `/business/register`, `/business/dashboard`.
- Marketplace: `/shopping`, `/shopping/[category]`, `/shopping/[category]/[vendorId]`, `/restaurants`, `/restaurants/[kitchenId]`.
- Admin: `/admin`, `/admin/dashboard`.

## API Route Groups

| Area | Routes |
| --- | --- |
| Auth | `/api/auth/oauth-provider-check`, `/auth/callback`, `/auth/confirm` |
| Customer delivery | `/api/deliveries/estimate`, `/api/deliveries/checkout`, `/api/deliveries/verify`, `/api/tracking`, `/api/customer/dashboard`, `/api/customer/pickup-proof` |
| Marketplace | `/api/marketplace/malls`, `/api/marketplace/restaurants`, `/api/marketplace/listing`, `/api/marketplace/estimate`, `/api/marketplace/checkout`, `/api/marketplace/verify` |
| Rider | `/api/rider/applications`, `/api/rider/availability`, `/api/rider/jobs`, `/api/rider/pickup-proof`, `/api/rider/withdrawals` |
| Business | `/api/business/registration`, `/api/business/profile`, `/api/business/orders`, `/api/business/team`, `/api/business/dispatch`, `/api/business/dispatch/bulk` |
| Wallet/payments | `/api/wallet/topup`, `/api/wallet/verify`, `/api/wallet/withdrawals`, `/api/wallet/transactions`, `/api/wallet/settle-delivery`, `/api/wallet/daily-commission`, `/api/payments/banks`, `/api/payments/resolve-account` |
| Maps/location | `/api/maps/address-autocomplete`, `/api/maps/place-details`, `/api/maps/reverse-geocode`, `/api/maps/distance`, `/api/location/current` |
| Notifications/promos | `/api/notifications/push-subscriptions`, `/api/promos/launch-first-150/enroll`, `/api/promos/launch-first-150/seen` |
| Uploads | `/api/uploads`, `/api/rider/pickup-proof` |
| Admin | `/api/admin/login`, `/api/admin/logout`, `/api/admin/riders`, `/api/admin/businesses`, `/api/admin/deliveries`, `/api/admin/withdrawals`, `/api/admin/malls`, `/api/admin/restaurants`, `/api/admin/marketplace-listings`, `/api/admin/risk-signals`, `/api/admin/site-controls`, `/api/admin/states`, `/api/admin/fleet-assets`, `/api/admin/company-transactions`, `/api/admin/main-hero-slides`, `/api/admin/hub-promotion-slides`, `/api/admin/promo-report`, `/api/admin/reviews` |
| Health/public config | `/api/health/readiness`, `/api/site-controls`, `/.well-known/assetlinks.json` |

## Non-HTTP Direct Surfaces

| Surface | Evidence | Notes |
| --- | --- | --- |
| Supabase browser client | `components/auth/*`, `components/support/*`, rider dashboard direct Supabase use | RLS is the control boundary. |
| Supabase storage | `supabase-schema.sql:3031-3125`, `app/api/uploads/route.ts` | Mix of private and public buckets. |
| Supabase Realtime | `supabase-schema.sql:3127+`, notification/dashboard components | Realtime policies inherit table RLS. |
| Service worker | `public/sw.js:1-192` | Offline queue, navigation cache, push click handling. |
| Android/iOS app package | `capacitor.config.ts`, `android/`, `ios/` | Public keys and web assets are recoverable from package. |
| Vercel cron | `vercel.json:1-8` | Calls wallet commission endpoint. |

## Rate-Limited Routes Observed

Routes importing `enforceRateLimit` include payment create/verify, delivery/marketplace estimate, maps, account lookup, rider jobs, pickup proof, and admin login.

Routes without observed rate limiting include many business mutations, uploads, support direct Supabase writes, admin actions, current location updates, push subscription registration, withdrawals, and daily commission.

