# Authorization Matrix

## Current Role Model

Roles observed: `customer`, `rider`, `business`, `admin`.

Critical role sources:

- `users.role`
- `profiles.account_type`
- `profiles.is_admin`
- Supabase Auth `user_metadata.role` / `user_metadata.account_type`
- Admin cookie `fastfleet_admin_session`

The current issue is that normal users can influence some of these role sources, while many RLS policies and route guards trust them.

## Desired Access Matrix

| Resource / Action | Anonymous | Customer | Rider | Business | Admin |
| --- | --- | --- | --- | --- | --- |
| Read public pages/content | Allow | Allow | Allow | Allow | Allow |
| Choose own non-admin account type | Deny unless signed in | Own profile only | Own profile only | Own profile only | Manage |
| Set `admin`, `is_admin`, KYC reviewed fields | Deny | Deny | Deny | Deny | Service/admin RPC only |
| Create delivery | Deny | Own | Deny | Business dispatch only | Manage |
| Read delivery | Deny | Own | Available/assigned only | Linked orders only | All |
| Accept delivery | Deny | Deny | Approved, online, matching rules | Deny | Manage |
| Update delivery status | Deny | Limited proof/confirm actions | Assigned rider only | Linked order state only | Manage |
| Read wallet/transactions | Deny | Own wallet | Own rider wallet | Own business wallet | All |
| Wallet funding | Deny | Own | Own rider wallet where allowed | Business order credit via system only | Manage |
| Withdrawal request | Deny | Deny | Own approved rider profile | Business withdrawal if intended | Review/manage |
| Upload profile photo | Deny | Own | Own | Own | Manage |
| Upload KYC docs | Deny | Deny | Own rider docs | Own business docs | Review/manage |
| Read KYC docs | Deny | Deny | Own docs | Own docs | Review/manage |
| Delivery proof photo | Deny | Delivery customer only | Assigned rider only | Linked business if applicable | Review/manage |
| Support ticket create | Rate-limited public or signed-in | Own | Own | Own | Manage |
| Support message create | Deny unless ticket owner or admin | Own ticket | Own ticket | Own ticket | Manage |
| Admin APIs | Deny | Deny | Deny | Deny | Admin session plus admin profile |

## Current Enforcement Notes

| Area | Current Enforcement | Gap |
| --- | --- | --- |
| Web route access | `middleware.ts:54-73` checks roles from profile/user tables | Role fields are writable by owners. |
| Admin APIs | `requireAdminSession()` cookie check | Supabase admin profile check is optional; fallback credentials exist. |
| RLS admin checks | `current_user_role()` / `current_user_is_admin()` | Both trust mutable owner-controlled fields. |
| Wallet RPCs | Auth checks, owner/admin checks, row locks | Admin role escalation undermines owner/admin checks. |
| Delivery acceptance | DB function locks rows and checks approved/online/vehicle/state | DB state check conflicts with API cross-state proximity logic. |
| Support | RLS `with check (true)` insert policies | Message insert not bound to ticket owner. |
| Storage | Bucket policies for docs/proofs/photos | Delivery proof is public/broad; upload route bypasses storage RLS with service role after app auth. |

## Priority Authorization Tests

1. Authenticated customer cannot update `users.role` to `admin`.
2. Authenticated customer cannot update `profiles.is_admin` or `profiles.account_type` to `admin`.
3. Authenticated customer cannot access any admin API even after direct Supabase profile update attempts.
4. Rider cannot approve own KYC/application fields.
5. Business cannot approve own KYC/listing fields.
6. User cannot read another user's wallet, transactions, support messages, KYC docs, or delivery proof.
7. Admin APIs require both admin cookie and Supabase admin profile in production.

