# F-012 Rider Eligibility And Marketplace Delivery Policy

Date: 2026-07-26  
Scope: F-012 only. No staging or production SQL was executed while preparing this change.

## Delivered Rules

- A rider whose registered state differs from the pickup state sees or receives a job only when their live location is no more than the configured pickup radius from the pickup and is no older than the configured freshness window.
- The initial Admin defaults are: 10 km pickup radius and 30 minutes location freshness.
- Bicycle jobs require an available assigned company bicycle and a route no longer than the existing configurable Bicycle max km fare setting. This applies within and across states.
- Restaurant and perishable-grocery routes beyond the configurable fresh-food maximum (initially 30 km) are blocked before payment and before business dispatch.
- Long cross-state non-perishable marketplace jobs use a size-based vehicle choice (bike, car, or van), cannot be bicycle jobs, show the customer the interstate timing notice, and need an explicit confirmation before checkout.
- Marketplace jobs store Google-resolved pickup and drop-off coordinates when available. Missing pickup coordinates fail closed for cross-border rider acceptance, while same-state jobs remain available.

## Authority And Consistency

`lib/rider-eligibility.ts` supplies the same eligibility logic to the rider job list, the business notification fan-out, and the API's early acceptance check. `public.accept_delivery_offer(...)` is still the authority: it repeats the cross-border proximity, freshness, vehicle, bicycle-distance, and assigned-bicycle checks inside one row-locking transaction. It reserves the bicycle before accepting the delivery, preventing two riders from taking the same asset.

## Admin Settings

In Admin → Operations control → Fare controls, save these values together with the existing fare settings:

- Cross-border pickup radius (km): `10`
- Rider location freshness (minutes): `30`
- Bicycle max km: existing fare control, initially `10`
- Fresh food maximum route (km): `30`
- Interstate delivery estimate (business days): `2`

The application validates and bounds these values. The migration stores the new policy below `platform_settings.admin_site_controls`; the database acceptance function also reads it so browser/API behavior cannot bypass it.

## Controlled Rollout

1. Take a database backup and apply `security-remediation/migrations/202607260001_f012_rider_eligibility.sql` to staging first, then run the local regression suite and staging delivery checks.
2. Verify Admin displays the five defaults above. Create same-state, local cross-state, stale-location, far-pickup, bicycle-over-limit, restaurant-over-limit, and long non-perishable marketplace test orders.
3. Only after staging approval, back up production, apply the migration once, verify the Admin settings, then deploy the matching application build.
4. If cross-border matching needs to be paused, set the pickup radius to `1` km in Admin. This leaves same-state delivery working and fails safely; do not remove the database guard or restore direct browser acceptance.
