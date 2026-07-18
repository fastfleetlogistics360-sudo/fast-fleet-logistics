# F-007 payment webhook and reconciliation runbook

## What this changes

Every external Squad payment now has a server-created payment intent before the customer is sent to Squad. Squad's signed webhook, the customer callback page, the protected cron, and an authorized admin retry all use the same server-side settlement path.

The application verifies the payment with Squad again, compares the exact transaction reference, integer Kobo amount, and `NGN` currency, then calls one locked Supabase RPC. The RPC changes the payment target and financial ledger together or changes none of them.

## Migration to review and run once

Run only [supabase-payment-webhook-reconciliation-delta.sql](../supabase-payment-webhook-reconciliation-delta.sql) in the Supabase SQL editor after reviewing it. Do **not** rerun `supabase-schema.sql`.

The migration creates:

- `payment_intents`: one trusted payment target and expected Kobo amount per Squad reference.
- `payment_webhook_receipts`: a digest-only, replay-safe receipt trail. It never stores the raw webhook body or signature.
- `record_squad_payment_observation(...)`: records pending/failed/review outcomes without giving value.
- `settle_squad_payment_intent(...)`: service-role-only, locked, atomic settlement.
- A namespaced unique company-ledger reference index for new `squad:` entries. Legacy rows are not changed or deleted.

The migration is transactional: an SQL error rolls back the migration. Do not delete payment intents, webhook receipts, transactions, or company logs to retry a payment.

## Required Vercel Production variables

Keep all of these server-only. None belongs in a `NEXT_PUBLIC_*` variable.

| Variable | Purpose |
| --- | --- |
| `SQUAD_SECRET_KEY` | Existing Squad API key and standard-payment webhook HMAC key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Runs the server-only payment settlement RPC. |
| `CRON_SECRET` | Existing 32+ character secret used by reconciliation cron authorization. |
| `PAYMENT_CALLBACK_ORIGIN` | Set to `https://fastfleet.com.ng`; makes callback URLs canonical. |
| `SQUAD_BASE_URL` | Use the matching Sandbox or Production Squad API base URL. |

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL` must remain correctly configured as before.

## Squad dashboard action

After the migration and application deployment are live, configure the standard-payment webhook URL in Squad:

```text
https://fastfleet.com.ng/api/payments/squad/webhook
```

The current application configuration identifies `https://fastfleet.com.ng` as canonical. Do not use the virtual-account `x-squad-signature` contract here. This route expects the standard-payment `x-squad-encrypted-body` HMAC-SHA512 signature using `SQUAD_SECRET_KEY`.

Keep the browser callback URLs enabled; they now show status, but do not independently credit money.

## Safe rollout order

1. Review the migration and take a normal Supabase backup/checkpoint.
2. Run only the focused migration above.
3. Add or confirm the Vercel Production variables.
4. Push/deploy this application code.
5. Confirm `POST /api/payments/squad/webhook` is reachable over HTTPS.
6. Configure the Squad dashboard webhook URL.
7. Run a Sandbox payment, then send the same valid webhook again.
8. Pay once, close the browser callback page, and confirm the webhook/reconciliation settles it once.
9. Check `payment_intents`, `payment_webhook_receipts`, transactions, wallet balances, orders/deliveries, and company logs together.
10. Observe the daily reconciliation cron and review `requires_review` records before enabling live volume.

`vercel.json` preserves the daily commission cron and adds the bounded daily reconciliation cron. If faster background reconciliation is required, upgrade/configure the Vercel plan before changing the schedule; do not bypass the signed webhook.

## Sandbox smoke tests

- Valid successful payment: intent moves `initialized` → `pending` → `settled` exactly once.
- Duplicate webhook: one webhook receipt/event key; no second wallet credit, order, delivery event, or company log.
- Browser callback and webhook at the same time: one settlement only.
- Wrong amount, reference, or currency: intent becomes `requires_review`; no value is given.
- Pending provider result: intent remains pending; no wallet/order/delivery financial mutation.
- Customer closes the browser after paying: webhook settles; the browser callback later reports success.
- Wallet funding, delivery checkout, marketplace business order, and marketplace delivery are each tested separately.

## Legacy pending payments

The reconciliation code can map a legacy record only when the server can prove its provider reference, owner, amount, currency, purpose, and exact delivery/order/wallet target. Ambiguous rows are not invented or auto-settled; they need manual review in Supabase/Squad using the payment reference.

Do not bulk-create intents, bulk-settle old rows, or edit a historical successful transaction by hand.

## Monitoring and manual reconciliation

- Review intents with `status = 'requires_review'` and their sanitized `failure_code`.
- Review webhook receipts with `processing_status = 'retryable'`.
- The cron is protected by `CRON_SECRET`.
- The manual route is `POST /api/admin/payments/reconcile` and accepts only a payment reference after a verified admin session. It cannot accept arbitrary wallet, order, or delivery IDs.

## Rollback

If the webhook must be paused, remove or disable the webhook URL in Squad first, then stop the reconciliation cron deployment. Keep the migration, payment intents, receipts, and ledgers intact. Browser status checks remain available for already-created payments.

Never delete records or automatically reverse a successful payment during rollback. Refunds, reversals, and chargebacks require a separate, reviewed adjustment workflow.
