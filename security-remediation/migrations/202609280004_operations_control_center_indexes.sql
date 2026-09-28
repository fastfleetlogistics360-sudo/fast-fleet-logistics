-- Phase 3 Operations Control Center query support.
-- Forward-only and re-runnable; do not run automatically from the application.
begin;

-- Rider page filters/order and the canonical latest-location lookup.
create index if not exists rider_profiles_operations_online_updated_idx
  on public.rider_profiles (online, updated_at desc);
create index if not exists rider_profiles_operations_zone_idx
  on public.rider_profiles (operating_zone) where operating_zone is not null;
create index if not exists rider_locations_operations_latest_idx
  on public.rider_locations (rider_profile_id, updated_at desc);

-- Busy is derived from the existing assigned delivery state, never persisted as
-- rider presence. This index supports the bounded rider-page hydration query.
create index if not exists deliveries_operations_rider_active_idx
  on public.deliveries (rider_id, updated_at desc)
  where rider_id is not null and status in ('accepted', 'accepted_pending_delivery', 'rider_arrived', 'picked_up', 'in_transit', 'awaiting_delivery_confirmation');
create index if not exists fleet_assets_operations_assignment_idx
  on public.fleet_assets (assigned_rider_profile_id, updated_at desc)
  where assigned_rider_profile_id is not null;

-- The assignment history already has an active-owner uniqueness index. This
-- matching lookup index avoids treating rider assignment as ownership.
create index if not exists investor_asset_assignments_operations_active_asset_idx
  on public.investor_asset_assignments (fleet_asset_id)
  where ended_at is null;

-- One server-only aggregate prevents the dashboard from downloading every
-- rider merely to calculate operational counts. It deliberately mirrors the
-- job-independent Operations definition; the dispatch path still applies each
-- delivery's geography, campus and route constraints before making an offer.
create or replace function public.operations_rider_summary(freshness_minutes integer)
returns table (online bigint, available bigint, busy bigint, offline bigint, location_stale bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where r.online) as online,
    count(*) filter (
      where r.online
        and r.application_status = 'approved'
        and not exists (
          select 1 from public.deliveries d
          where d.rider_id = r.id
            and d.status in ('accepted', 'accepted_pending_delivery', 'rider_arrived', 'picked_up', 'in_transit', 'awaiting_delivery_confirmation')
        )
        and (
          coalesce(r.vehicle_type::text, '') not in ('bike', 'bicycle')
          or r.independent_bicycle_enabled = true
          or exists (
            select 1 from public.fleet_assets f
            where f.assigned_rider_profile_id = r.id and f.status = 'available'
          )
        )
    ) as available,
    count(*) filter (
      where r.online and exists (
        select 1 from public.deliveries d
        where d.rider_id = r.id
          and d.status in ('accepted', 'accepted_pending_delivery', 'rider_arrived', 'picked_up', 'in_transit', 'awaiting_delivery_confirmation')
      )
    ) as busy,
    count(*) filter (where not r.online) as offline,
    count(*) filter (
      where r.online and not exists (
        select 1 from public.rider_locations l
        where l.rider_profile_id = r.id
          and l.updated_at >= now() - make_interval(mins => greatest(10, least(60, freshness_minutes)))
      )
    ) as location_stale
  from public.rider_profiles r;
$$;
revoke all on function public.operations_rider_summary(integer) from public, anon, authenticated;
grant execute on function public.operations_rider_summary(integer) to service_role;

commit;
