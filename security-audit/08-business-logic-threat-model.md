# Business Logic Threat Model

## Core Assets

- Customer delivery orders and marketplace orders.
- Rider job assignment, live location, pickup proof, and delivery status.
- Business marketplace listings and order income.
- Wallet balances, withdrawals, commissions, and company ledger.
- KYC documents and approval workflows.
- Admin controls for state launches, vendors, riders, businesses, promotions, and withdrawals.

## Threat Actors

| Actor | Goal |
| --- | --- |
| Anonymous visitor | Spam support, enumerate public APIs, abuse maps, probe admin login. |
| Malicious customer | Avoid payment, see other orders, spam orders, manipulate role. |
| Malicious rider | Accept jobs outside allowed rules, bypass KYC, fake location/status/proof, withdraw improperly. |
| Malicious business | Self-approve KYC/listings, manipulate marketplace income, see other business orders. |
| Compromised admin | Abuse broad service-role APIs, approve withdrawals, alter settings. |
| Device attacker | Read cached/offline data from PWA/native WebView, replay stored requests. |

## Abuse Cases

| Abuse Case | Current Control | Gap |
| --- | --- | --- |
| User self-grants admin | RLS exists | Role/admin fields writable by owner. |
| User creates unpaid delivery | Server recalculates amount and verifies provider | Need webhook reconciliation. |
| Wallet top-up replay | Provider reference uniqueness and RPC idempotency | Browser verify only; webhook missing. |
| Rider accepts same job twice | `accept_delivery_offer` row locks | Cross-state rules conflict. |
| Rider starts trip without customer proof | API blocks pending/rejected proof | Delivery proof storage privacy gap. |
| Spam support tickets | Browser direct insert | `with check (true)`, no route rate-limit. |
| Upload malware as KYC doc | Size limit | No content/magic validation. |
| Trigger commission job | Optional `CRON_SECRET` | Public if unset. |
| Abuse Maps cost | Maps rate limit | Some routes can use public key fallback. |
| Open notification to unsafe URL | Server push URL sanitizer mostly uses relative URLs | Service worker click handler accepts absolute URL from notification data. |

## Business Logic Priorities

1. Fix role/admin trust first.
2. Make database functions the single source of truth for rider eligibility and cross-state matching.
3. Make payment settlement asynchronous and provider-signed.
4. Treat wallet and commission flows as accounting ledgers with replay/idempotency tests.
5. Treat KYC and delivery proof files as private evidence, not public media.

