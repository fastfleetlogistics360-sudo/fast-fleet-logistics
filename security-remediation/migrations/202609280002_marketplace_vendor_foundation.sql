-- Phase 1: durable Marketplace vendor identity. Forward-only, additive, and
-- intentionally leaves platform_settings restaurant_menu/shopping_malls intact.
begin;

create table if not exists public.marketplace_vendors (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('restaurant', 'shopping')),
  legacy_menu_id text not null,
  display_name text not null,
  marketplace_category text,
  operational_mode text not null default 'fastfleet_managed' check (operational_mode in ('fastfleet_managed', 'self_managed')),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'paused', 'archived')),
  linked_business_profile_id uuid references public.business_profiles(id) on delete set null,
  claimed_business_profile_id uuid references public.business_profiles(id) on delete set null,
  managed_by_fastfleet boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_kind, legacy_menu_id)
);

create table if not exists public.marketplace_vendor_branches (
  id uuid primary key default gen_random_uuid(),
  marketplace_vendor_id uuid not null references public.marketplace_vendors(id) on delete cascade,
  legacy_branch_key text not null,
  state text,
  operational_area text,
  pickup_address text,
  pickup_place_id text,
  pickup_latitude numeric,
  pickup_longitude numeric,
  pickup_instructions text,
  operational_status text not null default 'open' check (operational_status in ('open', 'closed', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketplace_vendor_id, legacy_branch_key)
);

create table if not exists public.marketplace_operator_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  marketplace_vendor_id uuid references public.marketplace_vendors(id) on delete cascade,
  role text not null check (role in ('operator', 'manager')),
  all_vendors boolean not null default false,
  active boolean not null default true,
  granted_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((all_vendors and marketplace_vendor_id is null) or (not all_vendors and marketplace_vendor_id is not null))
);

create table if not exists public.marketplace_vendor_management_history (
  id uuid primary key default gen_random_uuid(),
  marketplace_vendor_id uuid not null references public.marketplace_vendors(id) on delete cascade,
  previous_mode text,
  next_mode text not null check (next_mode in ('fastfleet_managed', 'self_managed')),
  previous_claimed_business_profile_id uuid references public.business_profiles(id) on delete set null,
  next_claimed_business_profile_id uuid references public.business_profiles(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_audit_events (
  id uuid primary key default gen_random_uuid(),
  marketplace_vendor_id uuid references public.marketplace_vendors(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_type text not null check (actor_type in ('system', 'business', 'operator', 'admin')),
  action text not null,
  previous_state jsonb,
  next_state jsonb,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists marketplace_vendor_id uuid references public.marketplace_vendors(id) on delete set null,
  add column if not exists marketplace_vendor_branch_id uuid references public.marketplace_vendor_branches(id) on delete set null,
  add column if not exists marketplace_vendor_snapshot jsonb;

create index if not exists marketplace_vendors_linked_business_idx on public.marketplace_vendors(linked_business_profile_id) where linked_business_profile_id is not null;
create index if not exists marketplace_vendor_branches_vendor_idx on public.marketplace_vendor_branches(marketplace_vendor_id, operational_status);
create unique index if not exists marketplace_operator_memberships_active_scope_idx on public.marketplace_operator_memberships(user_id, coalesce(marketplace_vendor_id, '00000000-0000-0000-0000-000000000000'::uuid), all_vendors) where active;
create index if not exists marketplace_management_history_vendor_idx on public.marketplace_vendor_management_history(marketplace_vendor_id, created_at desc);
create index if not exists marketplace_audit_events_vendor_idx on public.marketplace_audit_events(marketplace_vendor_id, created_at desc);
create index if not exists marketplace_audit_events_order_idx on public.marketplace_audit_events(order_id, created_at desc);
create index if not exists orders_marketplace_vendor_idx on public.orders(marketplace_vendor_id, created_at desc) where marketplace_vendor_id is not null;

drop trigger if exists marketplace_vendors_set_updated_at on public.marketplace_vendors;
create trigger marketplace_vendors_set_updated_at before update on public.marketplace_vendors for each row execute function public.set_updated_at();
drop trigger if exists marketplace_vendor_branches_set_updated_at on public.marketplace_vendor_branches;
create trigger marketplace_vendor_branches_set_updated_at before update on public.marketplace_vendor_branches for each row execute function public.set_updated_at();
drop trigger if exists marketplace_operator_memberships_set_updated_at on public.marketplace_operator_memberships;
create trigger marketplace_operator_memberships_set_updated_at before update on public.marketplace_operator_memberships for each row execute function public.set_updated_at();

-- These are server-only operational records. RLS defaults to deny and no
-- browser policies are added; future operator APIs must authorize explicitly.
alter table public.marketplace_vendors enable row level security;
alter table public.marketplace_vendor_branches enable row level security;
alter table public.marketplace_operator_memberships enable row level security;
alter table public.marketplace_vendor_management_history enable row level security;
alter table public.marketplace_audit_events enable row level security;

-- Deterministic, rerun-safe backfill from the existing menu identities. A
-- businessId is recorded only as an operational link, never as ownership.
with restaurant as (
  select item as kitchen from public.platform_settings ps, lateral jsonb_array_elements(ps.value) item
  where ps.key = 'restaurant_menu' and jsonb_typeof(ps.value) = 'array'
), inserted as (
  insert into public.marketplace_vendors (source_kind, legacy_menu_id, display_name, marketplace_category, linked_business_profile_id)
  select 'restaurant', kitchen->>'id', coalesce(nullif(kitchen->>'name', ''), kitchen->>'id'), 'restaurant', case when kitchen->>'businessId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (kitchen->>'businessId')::uuid end
  from restaurant where coalesce(kitchen->>'id', '') <> ''
  on conflict (source_kind, legacy_menu_id) do update set display_name = excluded.display_name, linked_business_profile_id = coalesce(public.marketplace_vendors.linked_business_profile_id, excluded.linked_business_profile_id), updated_at = now()
  returning id, legacy_menu_id
)
insert into public.marketplace_vendor_branches (marketplace_vendor_id, legacy_branch_key, operational_area, pickup_address, pickup_place_id, pickup_latitude, pickup_longitude, pickup_instructions, operational_status)
select vendor.id, vendor.legacy_menu_id || ':default', kitchen->>'area', kitchen->>'address', kitchen->>'pickupPlaceId', nullif(kitchen->>'pickupLatitude', '')::numeric, nullif(kitchen->>'pickupLongitude', '')::numeric, kitchen->>'pickupNote', case when kitchen->>'operatingStatus' = 'closed' then 'closed' else 'open' end
from restaurant join public.marketplace_vendors vendor on vendor.source_kind = 'restaurant' and vendor.legacy_menu_id = kitchen->>'id'
on conflict (marketplace_vendor_id, legacy_branch_key) do nothing;

with malls as (
  select mall from public.platform_settings ps, lateral jsonb_array_elements(ps.value) mall where ps.key = 'shopping_malls' and jsonb_typeof(ps.value) = 'array'
), stores as (
  select mall, store from malls, lateral jsonb_array_elements(coalesce(mall->'stores', '[]'::jsonb)) store
)
insert into public.marketplace_vendors (source_kind, legacy_menu_id, display_name, marketplace_category, linked_business_profile_id)
select 'shopping', store->>'id', coalesce(nullif(store->>'name', ''), store->>'id'), store->>'category', case when store->>'businessId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (store->>'businessId')::uuid end
from stores where coalesce(store->>'id', '') <> ''
on conflict (source_kind, legacy_menu_id) do update set display_name = excluded.display_name, marketplace_category = excluded.marketplace_category, linked_business_profile_id = coalesce(public.marketplace_vendors.linked_business_profile_id, excluded.linked_business_profile_id), updated_at = now();

with malls as (
  select mall from public.platform_settings ps, lateral jsonb_array_elements(ps.value) mall where ps.key = 'shopping_malls' and jsonb_typeof(ps.value) = 'array'
), stores as (
  select mall, store from malls, lateral jsonb_array_elements(coalesce(mall->'stores', '[]'::jsonb)) store
), branches as (
  select store, mall, location from stores, lateral jsonb_array_elements(coalesce(store->'locations', '[]'::jsonb)) location
  union all
  select store, mall, jsonb_build_object('state', state) from stores, lateral jsonb_array_elements_text(coalesce(store->'operatingStates', '[]'::jsonb)) state
  union all
  select store, mall, jsonb_build_object('state', nullif(split_part(coalesce(mall->>'location',''), ',', 2), '')) from stores
  where jsonb_array_length(coalesce(store->'locations', '[]'::jsonb)) = 0 and jsonb_array_length(coalesce(store->'operatingStates', '[]'::jsonb)) = 0
)
insert into public.marketplace_vendor_branches (marketplace_vendor_id, legacy_branch_key, state, operational_area, pickup_address, pickup_place_id, pickup_latitude, pickup_longitude, pickup_instructions, operational_status)
select vendor.id, vendor.legacy_menu_id || ':' || coalesce(nullif(branches.location->>'state',''), 'default'), nullif(branches.location->>'state',''), coalesce(nullif(branches.location->>'state',''), branches.mall->>'location'), coalesce(branches.location->>'pickupAddress', branches.mall->>'location'), branches.location->>'pickupPlaceId', nullif(branches.location->>'pickupLatitude','')::numeric, nullif(branches.location->>'pickupLongitude','')::numeric, branches.location->>'pickupNote', case when branches.store->>'operatingStatus' = 'closed' then 'closed' else 'open' end
from branches join public.marketplace_vendors vendor on vendor.source_kind = 'shopping' and vendor.legacy_menu_id = branches.store->>'id'
on conflict (marketplace_vendor_id, legacy_branch_key) do nothing;

-- A fresh project may still be using the repository's built-in menu defaults
-- (and therefore have no platform_settings rows yet). Seed their stable IDs so
-- the new checkout guard remains compatible from its first deployment.
insert into public.marketplace_vendors (source_kind, legacy_menu_id, display_name, marketplace_category)
values
  ('restaurant','fastfleet-kitchen-partners','Fast Fleets 360 Kitchen Partners','restaurant'),
  ('restaurant','mainland-bites','Mainland Bites','restaurant'),
  ('restaurant','island-cafe','Island Cafe','restaurant'),
  ('shopping','market-square-ikeja','Market Square','Grocery'),
  ('shopping','healthplus-ikeja','HealthPlus','Pharmacy'),
  ('shopping','fashion-store-ikeja','Fashion Store','Fashion'),
  ('shopping','techhub-ikeja','TechHub Electronics','Electronics'),
  ('shopping','shoprite-palms','Shoprite','Grocery'),
  ('shopping','medplus-palms','Medplus','Pharmacy'),
  ('shopping','style-rack-palms','StyleRack Boutique','Fashion'),
  ('shopping','gadget-yard-palms','Gadget Yard','Gadgets'),
  ('shopping','spar-circle','SPAR','Grocery'),
  ('shopping','careplus-circle','CarePlus Pharmacy','Pharmacy'),
  ('shopping','sneaker-lane-circle','Sneaker Lane','Fashion')
on conflict (source_kind, legacy_menu_id) do nothing;

insert into public.marketplace_vendor_branches (marketplace_vendor_id, legacy_branch_key, state, operational_area, pickup_address)
select v.id, v.legacy_menu_id || ':default', 'Lagos', locations.area, locations.address
from public.marketplace_vendors v
join (values
  ('fastfleet-kitchen-partners','Lekki','14 Admiralty Way, Lekki Phase 1, Lagos'),
  ('mainland-bites','Yaba','22 Herbert Macaulay Way, Yaba, Lagos'),
  ('island-cafe','Victoria Island','7 Akin Adesola Street, Victoria Island, Lagos'),
  ('market-square-ikeja','Ikeja','Ikeja, Lagos'), ('healthplus-ikeja','Ikeja','Ikeja, Lagos'), ('fashion-store-ikeja','Ikeja','Ikeja, Lagos'), ('techhub-ikeja','Ikeja','Ikeja, Lagos'),
  ('shoprite-palms','Lekki','Lekki, Lagos'), ('medplus-palms','Lekki','Lekki, Lagos'), ('style-rack-palms','Lekki','Lekki, Lagos'), ('gadget-yard-palms','Lekki','Lekki, Lagos'),
  ('spar-circle','Jakande','Jakande, Lagos'), ('careplus-circle','Jakande','Jakande, Lagos'), ('sneaker-lane-circle','Jakande','Jakande, Lagos')
) as locations(legacy_menu_id, area, address) on locations.legacy_menu_id = v.legacy_menu_id
on conflict (marketplace_vendor_id, legacy_branch_key) do nothing;

commit;
