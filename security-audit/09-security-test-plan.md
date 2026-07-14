# Security Test Plan

This plan is safe to run in staging. Do not run destructive tests against production.

## Phase 1 - Authorization And RLS

| Test | Expected Result |
| --- | --- |
| Customer attempts `update users set role='admin' where id=auth.uid()` through Supabase client | Denied. |
| Customer attempts `update profiles set is_admin=true, account_type='admin'` | Denied. |
| User signs up with metadata `{ role: "admin" }` | Stored role remains customer or flow rejects. |
| Customer reads another customer wallet | Denied. |
| Rider reads another rider KYC documents | Denied. |
| User attempts admin RLS query after role mutation attempt | Denied. |

## Phase 2 - Admin

| Test | Expected Result |
| --- | --- |
| Deploy without admin env vars | App fails closed; no default login. |
| Admin cookie without Supabase admin profile | Denied in production. |
| Mutating admin API without CSRF/origin token | Denied. |
| Admin login brute-force | 429 after configured threshold. |

## Phase 3 - Payments And Wallet

| Test | Expected Result |
| --- | --- |
| Tamper delivery total lower than server quote | Rejected. |
| Verify payment reference for another user | Rejected. |
| Verify payment with wrong amount | Rejected. |
| Replay successful wallet funding verification | Idempotent, no double credit. |
| Replay wallet delivery payment | Idempotent, no double debit. |
| Commission run on zero-earning day | Skipped. |
| Commission endpoint without secret | Rejected. |
| Signed Squad webhook duplicate delivery | Idempotent once webhook exists. |

## Phase 4 - Upload And Storage

| Test | Expected Result |
| --- | --- |
| Upload `.html` as rider document | Rejected. |
| Upload file with fake MIME | Rejected by magic-byte validation. |
| Read another user's rider/business document | Denied. |
| Read delivery proof as unrelated signed-in user | Denied. |
| Generate proof signed URL as unrelated user | Denied. |

## Phase 5 - PWA/Mobile

| Test | Expected Result |
| --- | --- |
| Logout after viewing dashboard, then go offline and navigate back | Private page not served from cache. |
| Queue checkout offline, logout/switch account, reconnect | Replay blocked or reconfirmed. |
| Push notification with absolute external URL | Service worker opens only same-origin safe route. |
| Android app package review | No secret keys bundled; only public keys present. |

## Phase 6 - Resource Abuse

| Test | Expected Result |
| --- | --- |
| Support ticket spam from anonymous IP | Rate-limited. |
| Upload spam from authenticated user | Rate-limited and quota-limited. |
| Location update flood | Rate-limited. |
| Business registration/team/dispatch flood | Rate-limited. |
| Maps autocomplete flood | 429 and provider quota protected. |

