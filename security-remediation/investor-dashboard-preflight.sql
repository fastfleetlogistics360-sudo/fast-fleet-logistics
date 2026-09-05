-- Read-only preflight for the Bicycle Asset Dashboard foundation.
-- Run this against the target Supabase project before either investor migration.

select table_name, column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('users', 'profiles', 'fleet_assets', 'deliveries', 'rider_profiles')
order by table_name, ordinal_position;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.deliveries'::regclass
  and contype = 'f';

select asset_type, status, count(*) as asset_count
from public.fleet_assets
group by asset_type, status
order by asset_type, status;

select d.id as delivery_id, d.fleet_asset_id
from public.deliveries d
left join public.fleet_assets fa on fa.id = d.fleet_asset_id
where d.fleet_asset_id is not null and fa.id is null;

select d.id as delivery_id, d.fleet_asset_id, d.rider_id, fa.assigned_rider_profile_id
from public.deliveries d
join public.fleet_assets fa on fa.id = d.fleet_asset_id
where d.rider_id is not null
  and fa.assigned_rider_profile_id is not null
  and d.rider_id <> fa.assigned_rider_profile_id;

select fa.id as fleet_asset_id, fa.asset_code, fa.status, fa.current_delivery_id, d.status as current_delivery_status
from public.fleet_assets fa
left join public.deliveries d on d.id = fa.current_delivery_id
where fa.status = 'busy';
