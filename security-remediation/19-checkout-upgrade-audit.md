# Checkout Upgrade Audit

## Deployment status

`202610140001_rider_contact_payment_privacy.sql` is a local, uncommitted
forward migration. This repository contains no deployment ledger, connected
Supabase project, or production credential that can establish whether it has
been applied. Do not deploy the application code which relies on it until it
has been reviewed and applied to staging, followed by the production process
in `17-deployment-runbook.md`.

The migration is additive in behavior: it adds a payment-authorization helper
and replaces only customer-read rider-profile policies. It does not change
historical orders, payments, settlements, or balances.

## Existing reusable architecture

| Concern | Existing implementation | Required extension |
| --- | --- | --- |
| Delivery checkout | `app/api/deliveries/checkout/route.ts` creates a delivery, Squad payment intent, then payment settlement changes it to `searching`. | Create a reservation before Squad initialization, search before payment, and initialize the existing intent only after a rider accepts. |
| Rider assignment | `accept_or_queue_delivery_offer` atomically locks a rider, delivery, and bicycle asset. | Permit an explicitly reserved unpaid offer, record a five-minute expiration, and release the rider/asset safely on timeout. |
| Payment settlement | `settle_squad_payment_intent` verifies Squad server-side and is idempotent. | On a valid reservation, promote the assigned delivery without changing rider ownership; late/expired payments must enter review/reassignment rather than silently dispatch. |
| Contact privacy | `delivery_payment_is_verified`, API serializers, and rider action checks. | Keep these checks as the sole contact/action gate through reservation expiry, failure, and cancellation. |
| Vendor workflow | `transitionMarketplaceOrder` already prevents preparation before `payment_status = paid` and creates a delivery only at `ready_for_pickup`. | Branch paid `PICKUP` orders at `ready_for_pickup`; no delivery row, rider notification, or rider payout. |
| Secure handoff | `delivery_confirmations`, encrypted six-digit PIN, retry limit, and atomic `finalizeConfirmedDelivery`. | Add a pickup-order confirmation record/adapter using the same cryptographic and retry primitives, authorized to the owning vendor only. |

## Required forward state model

Payment and fulfilment remain separate.

* `orders.fulfilment_method`: `DELIVERY` (default for old rows) or `PICKUP`.
* Delivery reservations: `searching` -> `awaiting_customer_payment` after an
  accepted rider, then `accepted` after settled payment. Reservation state and
  expiration belong in protected delivery metadata or a dedicated reservation
  table, never in browser state.
* A late payment after reservation expiration must be marked for reconciliation
  or given a newly locked rider before the delivery becomes actionable.
* Pickup order workflow: paid `received` -> `preparing` -> `packing` ->
  `ready_for_pickup` -> `delivered`; it must never create a `deliveries` row.

## Implementation order

1. Apply and validate the rider-contact migration in staging; verify no
   unauthenticated or unpaid customer can read rider contact fields.
2. Add the reservation/pickup schema migration and an expiry worker endpoint.
3. Refactor direct-delivery checkout to create a searching reservation and add
   an owner-authorized payment-start endpoint called after rider acceptance.
4. Extend the existing settlement RPC/effects for reservation validation and
   late-payment reconciliation.
5. Add marketplace fulfilment selection, paid pickup notifications, and the
   vendor-scoped handoff verification endpoint/UI.
6. Run database staging tests for expiry, concurrent accept, duplicate
   callbacks, wrong-vendor code verification, and exactly-once completion.

No production schema, policy, or deployment action has been performed.
