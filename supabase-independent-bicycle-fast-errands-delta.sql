-- Local migration only. Apply through the normal Supabase migration process.
-- An independent bicycle is rider-owned: it is explicitly admin-enabled and
-- never treated as a Fast Fleets or investor fleet asset.
begin;

alter table public.rider_profiles
  add column if not exists independent_bicycle_enabled boolean not null default false;

alter table public.rider_profiles
  drop constraint if exists rider_profiles_independent_bicycle_account_check;
alter table public.rider_profiles
  add constraint rider_profiles_independent_bicycle_account_check
  check (not independent_bicycle_enabled or rider_account_type = 'independent');

-- Keep the existing queue, state, location, and bicycle-distance rules. The
-- sole additive path is an approved independent rider with this admin flag.
create or replace function public.accept_or_queue_delivery_offer(target_delivery_id uuid)
returns table(delivery_id uuid, assignment_status public.delivery_status)
language plpgsql security definer set search_path = public as $$
declare
  target_delivery public.deliveries%rowtype; target_rider public.rider_profiles%rowtype; target_bicycle public.fleet_assets%rowtype;
  next_status public.delivery_status; active_trip_id uuid; queued_trip_id uuid; bicycle_delivery boolean := false; independent_bicycle boolean := false;
  campus_priority_until timestamptz; campus_zone_id text; site_controls jsonb := '{}'::jsonb; rider_zone text; rider_state text;
  pickup_matches_rider_state boolean := false; cross_border_pickup_radius_km numeric := 10; location_freshness_minutes integer := 30; bicycle_max_route_km numeric := 10;
  rider_latitude numeric; rider_longitude numeric; rider_location_updated_at timestamptz; pickup_distance_km numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target_rider from public.rider_profiles where user_id = auth.uid() for update;
  if target_rider.id is null then raise exception 'Rider profile not found'; end if;
  if target_rider.application_status <> 'approved' then raise exception 'Your rider account must be approved before accepting dispatch orders'; end if;
  if target_rider.online is not true then raise exception 'Go online before accepting dispatch orders'; end if;
  select * into target_delivery from public.deliveries where id = target_delivery_id for update;
  if target_delivery.id is null then raise exception 'Delivery not found'; end if;
  if target_delivery.status <> 'searching' or target_delivery.rider_id is not null then raise exception 'This dispatch order has been accepted by another rider'; end if;
  if target_delivery.vehicle_type <> target_rider.vehicle_type then raise exception 'This dispatch order needs a different vehicle type'; end if;
  campus_zone_id := nullif(trim(target_delivery.metadata->>'campus_zone_id'), '');
  campus_priority_until := nullif(target_delivery.metadata->>'campus_rider_priority_until', '')::timestamptz;
  if campus_zone_id is not null and campus_priority_until is not null and campus_priority_until > now() and coalesce(target_rider.campus_zone_id, '') <> campus_zone_id then raise exception 'This campus delivery is currently reserved for its assigned campus riders'; end if;
  rider_zone := coalesce(target_rider.operating_zone, target_rider.address); rider_state := coalesce(nullif(trim(split_part(rider_zone, ',', 2)), ''), trim(rider_zone));
  if rider_state is null or rider_state = '' then raise exception 'Your rider operating state is missing'; end if;
  select value into site_controls from public.platform_settings where key = 'admin_site_controls'; site_controls := coalesce(site_controls, '{}'::jsonb);
  cross_border_pickup_radius_km := least(50, greatest(1, coalesce(nullif(site_controls #>> '{delivery_policy,rider,cross_border_pickup_radius_km}', '')::numeric, 10)));
  location_freshness_minutes := least(60, greatest(10, coalesce(nullif(site_controls #>> '{delivery_policy,rider,location_freshness_minutes}', '')::integer, 30)));
  bicycle_max_route_km := least(50, greatest(1, coalesce(nullif(site_controls #>> '{fare_config,bicycleMaxDistanceKm}', '')::numeric, 10)));
  if target_delivery.metadata ? 'campus_zone_id' then bicycle_max_route_km := least(30, greatest(1, coalesce(nullif(target_delivery.metadata->>'campus_bicycle_cap_km', '')::numeric, bicycle_max_route_km))); end if;
  pickup_matches_rider_state := target_delivery.pickup_address ilike '%' || rider_state || '%' or lower(coalesce(target_delivery.metadata->>'pickup_state', '')) = lower(rider_state);
  if not pickup_matches_rider_state then
    select latitude, longitude, updated_at into rider_latitude, rider_longitude, rider_location_updated_at from public.rider_locations where rider_profile_id = target_rider.id limit 1;
    if rider_location_updated_at is null or rider_location_updated_at < now() - make_interval(mins => location_freshness_minutes) then raise exception 'Share a recent live location before accepting a cross-border pickup'; end if;
    if rider_latitude is null or rider_longitude is null or target_delivery.pickup_latitude is null or target_delivery.pickup_longitude is null then raise exception 'This cross-border pickup does not have verified coordinates yet'; end if;
    pickup_distance_km := 6371 * 2 * atan2(sqrt(sin(radians(target_delivery.pickup_latitude - rider_latitude) / 2) ^ 2 + cos(radians(rider_latitude)) * cos(radians(target_delivery.pickup_latitude)) * sin(radians(target_delivery.pickup_longitude - rider_longitude) / 2) ^ 2), sqrt(1 - (sin(radians(target_delivery.pickup_latitude - rider_latitude) / 2) ^ 2 + cos(radians(rider_latitude)) * cos(radians(target_delivery.pickup_latitude)) * sin(radians(target_delivery.pickup_longitude - rider_longitude) / 2) ^ 2)));
    if pickup_distance_km > cross_border_pickup_radius_km then raise exception 'This pickup is outside your state and more than % km from your live location', cross_border_pickup_radius_km; end if;
  end if;
  select id into active_trip_id from public.deliveries where rider_id = target_rider.id and status in ('accepted', 'rider_arrived', 'picked_up', 'in_transit', 'awaiting_delivery_confirmation') order by accepted_at asc nulls last, created_at asc limit 1;
  select id into queued_trip_id from public.deliveries where rider_id = target_rider.id and status = 'accepted_pending_delivery' order by accepted_at asc nulls last, created_at asc limit 1;
  if queued_trip_id is not null then raise exception 'Complete your queued delivery before accepting another one'; end if;
  next_status := case when active_trip_id is null then 'accepted'::public.delivery_status else 'accepted_pending_delivery'::public.delivery_status end;
  bicycle_delivery := coalesce(target_delivery.vehicle_subtype, target_delivery.metadata->>'vehicle_subtype', target_delivery.metadata->>'vehicleSubtype', '') = 'bicycle';
  independent_bicycle := bicycle_delivery and target_rider.rider_account_type = 'independent' and target_rider.independent_bicycle_enabled is true;
  if bicycle_delivery then
    if target_delivery.distance_km <= 0 or target_delivery.distance_km > bicycle_max_route_km then raise exception 'Bicycle deliveries must be % km or less', bicycle_max_route_km; end if;
    if not independent_bicycle then
      select * into target_bicycle from public.fleet_assets where assigned_rider_profile_id = target_rider.id and asset_type = 'bicycle' and status not in ('maintenance', 'inactive') order by updated_at asc limit 1 for update skip locked;
      if target_bicycle.id is null then raise exception 'This delivery requires an assigned Fast Fleets bicycle or an enabled independent bicycle'; end if;
      if next_status = 'accepted' and target_bicycle.status <> 'available' then raise exception 'This delivery requires an available assigned Fast Fleets bicycle'; end if;
      if next_status = 'accepted' then update public.fleet_assets set status = 'busy', current_delivery_id = target_delivery.id, updated_at = now() where id = target_bicycle.id; end if;
    end if;
  end if;
  update public.deliveries set status = next_status, rider_id = target_rider.id, accepted_at = coalesce(accepted_at, now()), fleet_asset_id = case when bicycle_delivery and not independent_bicycle then target_bicycle.id else null end,
    metadata = metadata || jsonb_build_object('offer_status', case when next_status = 'accepted_pending_delivery' then 'queued' else 'accepted' end, 'accepted_at', now(), 'accepted_rider_id', target_rider.id, 'queued_after_delivery_id', active_trip_id, 'fleet_asset_id', case when bicycle_delivery and not independent_bicycle then target_bicycle.id else null end, 'fleet_asset_code', case when bicycle_delivery and not independent_bicycle then target_bicycle.asset_code else null end, 'independent_bicycle', independent_bicycle), updated_at = now() where id = target_delivery.id;
  insert into public.delivery_locations (order_id, rider_id, latitude, longitude, heading, speed, status, updated_at) select target_delivery.id, target_rider.id, rl.latitude, rl.longitude, rl.heading, rl.speed, next_status::text, now() from public.rider_locations rl where rl.rider_profile_id = target_rider.id on conflict (order_id) do update set rider_id=excluded.rider_id, latitude=excluded.latitude, longitude=excluded.longitude, heading=excluded.heading, speed=excluded.speed, status=excluded.status, updated_at=excluded.updated_at;
  insert into public.delivery_events (delivery_id, actor_id, status, title, body) values (target_delivery.id, target_rider.user_id, next_status, case when next_status = 'accepted_pending_delivery' then 'Next delivery accepted' else 'Courier assigned' end, case when next_status = 'accepted_pending_delivery' then 'Courier accepted this delivery. It will start after the current job is completed.' else 'A verified courier accepted the order.' end);
  return query select target_delivery.id, next_status;
end; $$;

-- A FastErrand payout remains delivery-fee-only. Independent bicycles now use
-- the already-existing independent 90/10 payout model, not fleet ownership.
create or replace function public.freeze_fast_errand_delivery_payout(target_delivery_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.deliveries%rowtype; assignment public.investor_asset_assignments%rowtype; existing public.fast_errand_delivery_payouts%rowtype; rider public.rider_profiles%rowtype;
  gross numeric; model text; rider_pct integer; investor_pct integer; company_pct integer; rider_share numeric; investor_share numeric; company_share numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'FastErrand payout freezing requires the trusted service' using errcode='42501'; end if;
  select * into d from public.deliveries where id=target_delivery_id for update;
  if d.id is null or coalesce(d.metadata->>'marketplace_kind','') <> 'fast_errands' or coalesce((d.metadata->'fast_errand'->>'schema_version')::integer, 0) <> 2 then return jsonb_build_object('applicable', false); end if;
  select * into existing from public.fast_errand_delivery_payouts where delivery_id=d.id;
  if existing.id is not null then return jsonb_build_object('applicable', true, 'payout_model', existing.payout_model, 'rider_payout_ngn', existing.rider_payout_ngn); end if;
  gross := round(coalesce(nullif(d.metadata->>'delivery_fee_ngn','')::numeric, d.price_ngn, 0), 0);
  if gross <= 0 or d.rider_id is null then raise exception 'FastErrand delivery needs a rider and positive service fee before payout can be frozen'; end if;
  select * into rider from public.rider_profiles where id=d.rider_id;
  if coalesce(d.vehicle_subtype, d.metadata->>'vehicle_subtype', '') = 'bicycle' then
    if d.fleet_asset_id is null then
      if rider.id is null or rider.rider_account_type <> 'independent' or rider.independent_bicycle_enabled is not true then raise exception 'Bicycle FastErrand delivery needs an assigned fleet asset or enabled independent bicycle rider'; end if;
      model := 'independent_rider'; rider_pct:=90; investor_pct:=0; company_pct:=10;
    else
      select * into assignment from public.investor_asset_assignments where fleet_asset_id=d.fleet_asset_id and assigned_at <= now() and (ended_at is null or ended_at > now()) order by assigned_at desc limit 1;
      if assignment.id is null then model := 'company_bicycle'; rider_pct:=30; investor_pct:=0; company_pct:=70; else model := 'investor_bicycle'; rider_pct:=30; investor_pct:=60; company_pct:=10; end if;
    end if;
  else model := 'independent_rider'; rider_pct:=90; investor_pct:=0; company_pct:=10; end if;
  rider_share := round(gross * rider_pct / 100, 0); investor_share := round(gross * investor_pct / 100, 0); company_share := gross-rider_share-investor_share;
  insert into public.fast_errand_delivery_payouts(delivery_id,payout_model,eligible_revenue_ngn,rider_percentage,rider_payout_ngn,investor_percentage,investor_payout_ngn,company_percentage,company_share_ngn,fleet_asset_id,rider_id,investor_profile_id,asset_ownership_model) values(d.id,model,gross,rider_pct,rider_share,investor_pct,investor_share,company_pct,company_share,d.fleet_asset_id,d.rider_id,case when model='investor_bicycle' then assignment.investor_profile_id else null end,model);
  update public.deliveries set metadata=metadata || jsonb_build_object('fast_errand_payout_model',model,'fast_errand_payout_frozen_at',now(),'fast_errand_rider_payout_ngn',rider_share,'fast_errand_investor_payout_ngn',investor_share,'fast_errand_company_share_ngn',company_share), updated_at=now() where id=d.id;
  return jsonb_build_object('applicable',true,'payout_model',model,'rider_payout_ngn',rider_share,'investor_payout_ngn',investor_share,'company_share_ngn',company_share);
end; $$;

commit;
