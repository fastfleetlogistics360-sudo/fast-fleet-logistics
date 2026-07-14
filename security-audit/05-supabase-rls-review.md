# Supabase RLS Review

## RLS Coverage

`supabase-schema.sql:2258-2294` enables RLS on the main public tables, including users, profiles, deliveries, rider/business profiles, wallets, transactions, withdrawals, notifications, support, rate limits, pricing, and fraud signals.

This is good. The problem is not lack of RLS overall. The problem is that some policies trust fields that users can currently modify.

## Critical RLS Findings

| Table / Function | Evidence | Status | Review |
| --- | --- | --- | --- |
| `public.users` | `supabase-schema.sql:2333-2342` | Fail | Owner update/insert policies do not protect `role`. |
| `public.profiles` | `supabase-schema.sql:2354-2358` | Fail | Owner update policy does not protect `account_type`, `is_admin`, or `kyc_status`. |
| `current_user_role()` | `supabase-schema.sql:111-119` | Fail by dependency | Reads mutable `users.role`. |
| `current_user_is_admin()` | `supabase-schema.sql:121-129` | Fail by dependency | Reads mutable `profiles.is_admin`. |
| New user trigger | `supabase-schema.sql:262-310` | Fail | Accepts `admin` from raw user metadata. |
| Rider profile/app RLS | `supabase-schema.sql:2410-2472` | Weak | Some KYC field triggers exist, but admin bypass depends on mutable admin fields. |
| Business profile RLS | `supabase-schema.sql:2474-2495` | Weak | Admin bypass depends on mutable admin role. |
| Deliveries RLS | `supabase-schema.sql:2571-2636` | Weak | Admin bypass depends on mutable admin role; customer update is broad. |
| Wallet/transactions RLS | `supabase-schema.sql:2782-2793` | Weak | Owner select is good; admin bypass depends on mutable admin role. |
| Withdrawal RLS | `supabase-schema.sql:2829-2839` | Weak | All access for owner/admin; admin bypass depends on mutable admin role. |
| Support RLS | `supabase-schema.sql:2909-2928` | Fail | Anyone can insert tickets/messages. |
| Storage policies | `supabase-schema.sql:3031-3125` | Mixed | KYC buckets private; delivery proofs public/broad. |

## Positive RLS/DB Controls

- RLS is enabled broadly.
- Wallet operations use security-definer functions with authentication and row locks.
- Payment transaction uniqueness exists on provider reference: `supabase-schema.sql:945-946`.
- `accept_delivery_offer` locks rider and delivery rows with `for update`: `supabase-schema.sql:1381-1401`.
- KYC self-approval protection triggers exist in the schema, but their admin bypass relies on the same mutable admin trust path.

## Required RLS Fix Pattern

Normal users should be allowed to update only safe profile fields:

- full name
- avatar
- phone/email where appropriate
- default zone/location preferences

Normal users must not update:

- `role`
- `account_type` after initial non-admin selection unless controlled by server
- `is_admin`
- `kyc_status`
- `application_status`
- `registration_status`
- `reviewed_by`
- `reviewed_at`
- wallet balances
- admin notes

Recommended approach:

1. Add explicit `with check` comparisons using `old` values through triggers or split safe fields into separate RPCs.
2. Revoke direct `authenticated` update on sensitive columns if column privileges are used.
3. Create service-role-only/admin-only RPCs for role/KYC transitions.
4. Add pgTAP or migration smoke tests for each protected field.

