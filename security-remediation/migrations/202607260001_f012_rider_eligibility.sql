begin;

insert into public.platform_settings (key, value)
values (
  'admin_site_controls',
  '{
    "delivery_policy": {
      "rider": {
        "cross_border_pickup_radius_km": 10,
        "location_freshness_minutes": 30
      },
      "marketplace": {
        "fresh_food_max_route_km": 30,
        "interstate_delivery_days": 2
      }
    }
  }'::jsonb
)
on conflict (key) do update
set value = public.platform_settings.value || jsonb_build_object(
  'delivery_policy',
  coalesce(public.platform_settings.value->'delivery_policy', excluded.value->'delivery_policy')
),
updated_at = now();

create or replace function public.accept_delivery_offer(target_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_delivery public.deliveries%rowtype;
  target_rider public.rider_profiles%rowtype;
  target_bicycle public.fleet_assets%rowtype;
  site_controls jsonb := '{}'::jsonb;
  rider_zone text;
  rider_state text;
  pickup_matches_rider_state boolean := false;
  cross_border_pickup_radius_km numeric := 10;
  location_freshness_minutes integer := 30;
  bicycle_max_route_km numeric := 10;
  rider_latitude numeric;
  rider_longitude numeric;
  rider_location_updated_at timestamptz;
  pickup_distance_km numeric;
  bicycle_delivery boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_rider
  from public.rider_profiles
  where user_id = auth.uid()
  for update;

  if target_rider.id is null then
    raise exception 'Rider profile not found';
  end if;

  if target_rider.application_status <> 'approved' then
    raise exception 'Your rider account must be approved before accepting dispatch orders';
  end if;

  if target_rider.online is not true then
    raise exception 'Go online before accepting dispatch orders';
  end if;

  select * into target_delivery
  from public.deliveries
  where id = target_delivery_id
  for update;

  if target_delivery.id is null then
    raise exception 'Delivery not found';
  end if;

  if target_delivery.status <> 'searching' or target_delivery.rider_id is not null then
    raise exception 'This dispatch order has been accepted by another rider';
  end if;

  if target_delivery.vehicle_type <> target_rider.vehicle_type then
    raise exception 'This dispatch order needs a different vehicle type';
  end if;

  rider_zone := coalesce(target_rider.operating_zone, target_rider.address);
  rider_state := coalesce(nullif(trim(split_part(rider_zone, ',', 2)), ''), trim(rider_zone));
  if rider_state is null or rider_state = '' then
    raise exception 'Your rider operating state is missing';
  end if;

  select value into site_controls
  from public.platform_settings
  where key = 'admin_site_controls';
  site_controls := coalesce(site_controls, '{}'::jsonb);
  cross_border_pickup_radius_km := least(50, greatest(1, coalesce(nullif(site_controls #>> '{delivery_policy,rider,cross_border_pickup_radius_km}', '')::numeric, 10)));
  location_freshness_minutes := least(60, greatest(10, coalesce(nullif(site_controls #>> '{delivery_policy,rider,location_freshness_minutes}', '')::integer, 30)));
  bicycle_max_route_km := least(50, greatest(1, coalesce(nullif(site_controls #>> '{fare_config,bicycleMaxDistanceKm}', '')::numeric, 10)));

  pickup_matches_rider_state := target_delivery.pickup_address ilike '%' || rider_state || '%'
    or lower(coalesce(target_delivery.metadata->>'pickup_state', '')) = lower(rider_state);

  if not pickup_matches_rider_state then
    select latitude, longitude, updated_at
    into rider_latitude, rider_longitude, rider_location_updated_at
    from public.rider_locations
    where rider_profile_id = target_rider.id
    limit 1;

    if rider_location_updated_at is null or rider_location_updated_at < now() - make_interval(mins => location_freshness_minutes) then
      raise exception 'Share a recent live location before accepting a cross-border pickup';
    end if;

    if rider_latitude is null or rider_longitude is null or target_delivery.pickup_latitude is null or target_delivery.pickup_longitude is null then
      raise exception 'This cross-border pickup does not have verified coordinates yet';
    end if;

    pickup_distance_km := 6371 * 2 * atan2(
      sqrt(
        sin(radians(target_delivery.pickup_latitude - rider_latitude) / 2) ^ 2
        + cos(radians(rider_latitude)) * cos(radians(target_delivery.pickup_latitude))
          * sin(radians(target_delivery.pickup_longitude - rider_longitude) / 2) ^ 2
      ),
      sqrt(
        1 - (
          sin(radians(target_delivery.pickup_latitude - rider_latitude) / 2) ^ 2
          + cos(radians(rider_latitude)) * cos(radians(target_delivery.pickup_latitude))
            * sin(radians(target_delivery.pickup_longitude - rider_longitude) / 2) ^ 2
        )
      )
    );

    if pickup_distance_km > cross_border_pickup_radius_km then
      raise exception 'This pickup is outside your state and more than % km from your live location', cross_border_pickup_radius_km;
    end if;
  end if;

  bicycle_delivery := coalesce(target_delivery.vehicle_subtype, target_delivery.metadata->>'vehicle_subtype', target_delivery.metadata->>'vehicleSubtype', '') = 'bicycle';
  if bicycle_delivery then
    if target_delivery.distance_km <= 0 or target_delivery.distance_km > bicycle_max_route_km then
      raise exception 'Bicycle deliveries must be % km or less', bicycle_max_route_km;
    end if;

    select * into target_bicycle
    from public.fleet_assets
    where assigned_rider_profile_id = target_rider.id
      and asset_type = 'bicycle'
      and status = 'available'
    order by updated_at asc
    limit 1
    for update skip locked;

    if target_bicycle.id is null then
      raise exception 'This delivery requires an available assigned Fast Fleets bicycle';
    end if;

    update public.fleet_assets
    set status = 'busy',
        current_delivery_id = target_delivery.id,
        updated_at = now()
    where id = target_bicycle.id;
  end if;

  update public.deliveries
  set status = 'accepted',
      rider_id = target_rider.id,
      accepted_at = coalesce(accepted_at, now()),
      fleet_asset_id = case when bicycle_delivery then target_bicycle.id else fleet_asset_id end,
      metadata = metadata || jsonb_build_object(
        'offer_status', 'accepted',
        'accepted_at', now(),
        'accepted_rider_id', target_rider.id,
        'fleet_asset_id', case when bicycle_delivery then target_bicycle.id else null end,
        'fleet_asset_code', case when bicycle_delivery then target_bicycle.asset_code else null end
      ),
      updated_at = now()
  where id = target_delivery.id;

  insert into public.delivery_locations (order_id, rider_id, latitude, longitude, heading, speed, status, updated_at)
  select target_delivery.id, target_rider.id, rl.latitude, rl.longitude, rl.heading, rl.speed, 'accepted', now()
  from public.rider_locations rl
  where rl.rider_profile_id = target_rider.id
  on conflict (order_id) do update set
    rider_id = excluded.rider_id,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    heading = excluded.heading,
    speed = excluded.speed,
    status = excluded.status,
    updated_at = excluded.updated_at;

  insert into public.delivery_events (delivery_id, actor_id, status, title, body)
  values (target_delivery.id, target_rider.user_id, 'accepted', 'Courier assigned', 'A verified courier accepted the order.');

  return target_delivery.id;
end;
$$;

commit;
