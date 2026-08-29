-- Customer vehicle-option matching. Run after the existing delivery and fleet
-- migrations. This keeps the database, not the customer UI, authoritative for
-- rider-to-vehicle compatibility.

create or replace function public.enforce_delivery_vehicle_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bicycle riders are represented by an assigned Fast Fleets bicycle asset.
  -- They can only be assigned to the explicit bicycle service option. The
  -- rider acceptance RPC still performs the stricter availability reservation
  -- for that option in its own transaction.
  if new.rider_id is not null
    and new.vehicle_type = 'bike'
    and coalesce(new.vehicle_subtype, new.metadata->>'vehicle_subtype', '') <> 'bicycle'
    and exists (
      select 1
      from public.fleet_assets asset
      where asset.assigned_rider_profile_id = new.rider_id
        and asset.asset_type = 'bicycle'
    ) then
    raise exception 'This delivery requires a motorcycle rider, not a bicycle rider';
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_enforce_vehicle_match on public.deliveries;
create trigger deliveries_enforce_vehicle_match
before insert or update of rider_id, vehicle_type, vehicle_subtype, metadata
on public.deliveries
for each row execute function public.enforce_delivery_vehicle_match();
