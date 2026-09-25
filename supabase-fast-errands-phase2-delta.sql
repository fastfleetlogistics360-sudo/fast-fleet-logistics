-- FastErrands Phase 2: additive neighbourhood catalogue, pricing and payout support.
-- Run after supabase-schema.sql, supabase-fast-errands-catalog-delta.sql and
-- supabase-marketplace-queue-campus-delta.sql.  This migration intentionally
-- leaves legacy fast_errand_orders and historical orders untouched.

begin;

alter table public.fast_errand_catalog_items
  add column if not exists image_url text,
  add column if not exists image_path text;

create table if not exists public.fast_errand_service_areas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  service_type text not null default 'neighborhood' check (service_type = 'neighborhood'),
  pricing_mode text not null default 'distance_bands' check (pricing_mode = 'distance_bands'),
  business_profile_id uuid not null references public.business_profiles(id) on delete restrict,
  origin_address text not null check (char_length(trim(origin_address)) >= 6),
  origin_place_id text,
  origin_latitude numeric,
  origin_longitude numeric,
  maximum_distance_meters integer not null check (maximum_distance_meters > 0 and maximum_distance_meters <= 100000),
  minimum_cart_ngn numeric not null default 1500 check (minimum_cart_ngn >= 1),
  priority integer not null default 100,
  pricing_version integer not null default 1 check (pricing_version > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((origin_latitude is null and origin_longitude is null) or (origin_latitude between -90 and 90 and origin_longitude between -180 and 180))
);

create table if not exists public.fast_errand_service_area_bands (
  id uuid primary key default gen_random_uuid(),
  service_area_id uuid not null references public.fast_errand_service_areas(id) on delete cascade,
  min_distance_exclusive_meters integer not null default 0 check (min_distance_exclusive_meters >= 0),
  max_distance_inclusive_meters integer not null check (max_distance_inclusive_meters > min_distance_exclusive_meters),
  service_fee_ngn numeric not null check (service_fee_ngn >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service_area_id, min_distance_exclusive_meters),
  unique(service_area_id, max_distance_inclusive_meters)
);

create index if not exists fast_errand_service_areas_active_idx on public.fast_errand_service_areas(is_active, priority, code);
create index if not exists fast_errand_service_area_bands_active_idx on public.fast_errand_service_area_bands(service_area_id, is_active, min_distance_exclusive_meters, max_distance_inclusive_meters);

drop trigger if exists fast_errand_service_areas_set_updated_at on public.fast_errand_service_areas;
create trigger fast_errand_service_areas_set_updated_at before update on public.fast_errand_service_areas for each row execute function public.set_updated_at();
drop trigger if exists fast_errand_service_area_bands_set_updated_at on public.fast_errand_service_area_bands;
create trigger fast_errand_service_area_bands_set_updated_at before update on public.fast_errand_service_area_bands for each row execute function public.set_updated_at();

-- Enforce a contiguous 0..maximum_distance_meters active band schedule when
-- activating an area.  A deferrable configuration check is deliberately not
-- used: areas remain editable while inactive and activation is the gate.
create or replace function public.fast_errand_validate_area_activation()
returns trigger language plpgsql security definer set search_path = public as $$
declare previous_max integer := 0; band record; valid_business boolean;
begin
  if new.is_active is not true then return new; end if;
  select exists(select 1 from public.business_profiles where id = new.business_profile_id and registration_status = 'active') into valid_business;
  if not valid_business then raise exception 'FastErrand service area requires an active fulfilment business'; end if;
  if coalesce(trim(new.origin_address), '') = '' then raise exception 'FastErrand service area requires an origin'; end if;
  for band in select * from public.fast_errand_service_area_bands where service_area_id = new.id and is_active order by min_distance_exclusive_meters, max_distance_inclusive_meters loop
    if band.min_distance_exclusive_meters <> previous_max or band.max_distance_inclusive_meters <= previous_max then
      raise exception 'FastErrand pricing bands must be contiguous and non-overlapping';
    end if;
    previous_max := band.max_distance_inclusive_meters;
  end loop;
  if previous_max <> new.maximum_distance_meters then
    raise exception 'FastErrand pricing bands must cover the configured maximum distance exactly';
  end if;
  return new;
end; $$;
drop trigger if exists fast_errand_validate_area_activation on public.fast_errand_service_areas;
create trigger fast_errand_validate_area_activation before insert or update of is_active, business_profile_id, origin_address, maximum_distance_meters on public.fast_errand_service_areas for each row execute function public.fast_errand_validate_area_activation();

-- The snapshot is frozen as soon as a rider accepts the actual delivery.
create table if not exists public.fast_errand_delivery_payouts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.deliveries(id) on delete restrict,
  payout_model text not null check (payout_model in ('company_bicycle', 'investor_bicycle', 'independent_rider')),
  eligible_revenue_ngn numeric not null check (eligible_revenue_ngn > 0),
  rider_percentage integer not null check (rider_percentage between 0 and 100),
  rider_payout_ngn numeric not null check (rider_payout_ngn >= 0),
  investor_percentage integer not null check (investor_percentage between 0 and 100),
  investor_payout_ngn numeric not null check (investor_payout_ngn >= 0),
  company_percentage integer not null check (company_percentage between 0 and 100),
  company_share_ngn numeric not null check (company_share_ngn >= 0),
  fleet_asset_id uuid references public.fleet_assets(id) on delete restrict,
  rider_id uuid references public.rider_profiles(id) on delete restrict,
  investor_profile_id uuid references public.investor_profiles(id) on delete restrict,
  asset_ownership_model text not null,
  frozen_at timestamptz not null default now(),
  settled_at timestamptz,
  check (rider_percentage + investor_percentage + company_percentage = 100),
  check (rider_payout_ngn + investor_payout_ngn + company_share_ngn = eligible_revenue_ngn),
  check ((payout_model = 'investor_bicycle') = (investor_profile_id is not null))
);
create index if not exists fast_errand_delivery_payouts_rider_idx on public.fast_errand_delivery_payouts(rider_id, frozen_at desc);
create index if not exists fast_errand_delivery_payouts_investor_idx on public.fast_errand_delivery_payouts(investor_profile_id, frozen_at desc);

create or replace function public.freeze_fast_errand_delivery_payout(target_delivery_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.deliveries%rowtype; assignment public.investor_asset_assignments%rowtype; existing public.fast_errand_delivery_payouts%rowtype;
  gross numeric; model text; rider_pct integer; investor_pct integer; company_pct integer; rider_share numeric; investor_share numeric; company_share numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'FastErrand payout freezing requires the trusted service' using errcode='42501'; end if;
  select * into d from public.deliveries where id=target_delivery_id for update;
  if d.id is null or coalesce(d.metadata->>'marketplace_kind','') <> 'fast_errands' or coalesce((d.metadata->'fast_errand'->>'schema_version')::integer, 0) <> 2 then return jsonb_build_object('applicable', false); end if;
  select * into existing from public.fast_errand_delivery_payouts where delivery_id=d.id;
  if existing.id is not null then return jsonb_build_object('applicable', true, 'payout_model', existing.payout_model, 'rider_payout_ngn', existing.rider_payout_ngn); end if;
  gross := round(coalesce(nullif(d.metadata->>'delivery_fee_ngn','')::numeric, d.price_ngn, 0), 0);
  if gross <= 0 or d.rider_id is null then raise exception 'FastErrand delivery needs a rider and positive service fee before payout can be frozen'; end if;
  if coalesce(d.vehicle_subtype, d.metadata->>'vehicle_subtype', '') = 'bicycle' then
    if d.fleet_asset_id is null then raise exception 'Bicycle FastErrand delivery needs its assigned fleet asset'; end if;
    select * into assignment from public.investor_asset_assignments where fleet_asset_id=d.fleet_asset_id and assigned_at <= now() and (ended_at is null or ended_at > now()) order by assigned_at desc limit 1;
    if assignment.id is null then model := 'company_bicycle'; rider_pct:=30; investor_pct:=0; company_pct:=70;
    else model := 'investor_bicycle'; rider_pct:=30; investor_pct:=60; company_pct:=10; end if;
  else
    model := 'independent_rider'; rider_pct:=90; investor_pct:=0; company_pct:=10;
  end if;
  rider_share := round(gross * rider_pct / 100, 0); investor_share := round(gross * investor_pct / 100, 0); company_share := gross-rider_share-investor_share;
  insert into public.fast_errand_delivery_payouts(delivery_id,payout_model,eligible_revenue_ngn,rider_percentage,rider_payout_ngn,investor_percentage,investor_payout_ngn,company_percentage,company_share_ngn,fleet_asset_id,rider_id,investor_profile_id,asset_ownership_model)
  values(d.id,model,gross,rider_pct,rider_share,investor_pct,investor_share,company_pct,company_share,d.fleet_asset_id,d.rider_id,case when model='investor_bicycle' then assignment.investor_profile_id else null end,model);
  update public.deliveries set metadata=metadata || jsonb_build_object('fast_errand_payout_model',model,'fast_errand_payout_frozen_at',now(),'fast_errand_rider_payout_ngn',rider_share,'fast_errand_investor_payout_ngn',investor_share,'fast_errand_company_share_ngn',company_share), updated_at=now() where id=d.id;
  return jsonb_build_object('applicable',true,'payout_model',model,'rider_payout_ngn',rider_share,'investor_payout_ngn',investor_share,'company_share_ngn',company_share);
end; $$;

-- Credit only the investor portion at completion. Rider wallet credit remains
-- in the canonical wallet-ledger path, which uses this immutable snapshot.
create or replace function public.settle_fast_errand_investor_payout(target_delivery_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.fast_errand_delivery_payouts%rowtype; wallet public.investor_wallets%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'FastErrand payout settlement requires the trusted service' using errcode='42501'; end if;
  select * into p from public.fast_errand_delivery_payouts where delivery_id=target_delivery_id for update;
  if p.id is null then return jsonb_build_object('applicable',false); end if;
  if p.settled_at is not null then return jsonb_build_object('applicable',true,'already_settled',true,'rider_payout_ngn',p.rider_payout_ngn,'investor_payout_ngn',p.investor_payout_ngn,'company_share_ngn',p.company_share_ngn,'payout_model',p.payout_model); end if;
  if p.investor_profile_id is not null and p.investor_payout_ngn > 0 then
    insert into public.investor_wallets(investor_profile_id) values(p.investor_profile_id) on conflict(investor_profile_id) do nothing;
    select * into wallet from public.investor_wallets where investor_profile_id=p.investor_profile_id for update;
    update public.investor_wallets set available_balance_ngn=available_balance_ngn+p.investor_payout_ngn,updated_at=now() where id=wallet.id;
    insert into public.investor_ledger_entries(investor_wallet_id,investor_profile_id,fleet_asset_id,entry_type,amount_ngn,balance_after_ngn,metadata)
      values(wallet.id,p.investor_profile_id,p.fleet_asset_id,'delivery_owner_share',p.investor_payout_ngn,wallet.available_balance_ngn+p.investor_payout_ngn,jsonb_build_object('delivery_id',p.delivery_id,'fast_errand_payout_id',p.id,'payout_model',p.payout_model));
  end if;
  update public.fast_errand_delivery_payouts set settled_at=now() where id=p.id;
  return jsonb_build_object('applicable',true,'rider_payout_ngn',p.rider_payout_ngn,'investor_payout_ngn',p.investor_payout_ngn,'company_share_ngn',p.company_share_ngn,'payout_model',p.payout_model);
end; $$;

revoke all on function public.freeze_fast_errand_delivery_payout(uuid) from public, anon, authenticated;
revoke all on function public.settle_fast_errand_investor_payout(uuid) from public, anon, authenticated;
grant execute on function public.freeze_fast_errand_delivery_payout(uuid) to service_role;
grant execute on function public.settle_fast_errand_investor_payout(uuid) to service_role;

alter table public.fast_errand_service_areas enable row level security;
alter table public.fast_errand_service_area_bands enable row level security;
alter table public.fast_errand_delivery_payouts enable row level security;
revoke all on public.fast_errand_service_areas, public.fast_errand_service_area_bands, public.fast_errand_delivery_payouts from anon, authenticated;
drop policy if exists "Admins read FastErrand payout snapshots" on public.fast_errand_delivery_payouts;
create policy "Admins read FastErrand payout snapshots" on public.fast_errand_delivery_payouts for select using (public.current_user_role()='admin');

commit;
