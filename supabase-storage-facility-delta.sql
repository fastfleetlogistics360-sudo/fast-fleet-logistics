-- Additive mini-storage booking support. No historical orders or deliveries are rewritten.
begin;

create sequence if not exists public.storage_booking_reference_seq;

create table if not exists public.storage_facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  service_area text,
  address text not null check (char_length(trim(address)) >= 6),
  place_id text,
  latitude numeric,
  longitude numeric,
  operating_notes text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);

create table if not exists public.storage_catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 120),
  storage_band text not null check (storage_band in ('small','medium','large','xl')),
  description text,
  daily_rate_ngn numeric not null check (daily_rate_ngn >= 0),
  weekly_rate_ngn numeric not null check (weekly_rate_ngn >= 0),
  monthly_rate_ngn numeric not null check (monthly_rate_ngn >= 0),
  requires_review boolean not null default false,
  is_other boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  pricing_version integer not null default 1 check (pricing_version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists storage_catalog_one_other_idx on public.storage_catalog_items(is_other) where is_other;

create table if not exists public.storage_bookings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  booking_reference text not null unique default ('FF360-ST-' || lpad(nextval('public.storage_booking_reference_seq')::text, 5, '0')),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  facility_id uuid not null references public.storage_facilities(id) on delete restrict,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','booking_confirmed','awaiting_pickup','awaiting_drop_off','in_transit_to_storage','received_at_facility','in_storage','ready_for_collection','out_for_return_delivery','completed','cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  pickup_selected boolean not null default false,
  pickup_address text,
  pickup_contact text,
  pickup_instructions text,
  preferred_pickup_at timestamptz,
  storage_start_at timestamptz,
  storage_end_at timestamptz,
  prohibited_items_acknowledged_at timestamptz not null,
  customer_note text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists storage_bookings_customer_idx on public.storage_bookings(customer_id, created_at desc);
create index if not exists storage_bookings_status_idx on public.storage_bookings(status, created_at desc);

create table if not exists public.storage_booking_extensions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.storage_bookings(id) on delete restrict,
  extension_kind text not null check (extension_kind in ('day','week','month')),
  units integer not null check (units > 0 and units <= 12),
  amount_ngn numeric not null check (amount_ngn >= 0),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','cancelled')),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), paid_at timestamptz
);

drop trigger if exists storage_facilities_updated_at on public.storage_facilities;
create trigger storage_facilities_updated_at before update on public.storage_facilities for each row execute function public.set_updated_at();
drop trigger if exists storage_catalog_items_updated_at on public.storage_catalog_items;
create trigger storage_catalog_items_updated_at before update on public.storage_catalog_items for each row execute function public.set_updated_at();
drop trigger if exists storage_bookings_updated_at on public.storage_bookings;
create trigger storage_bookings_updated_at before update on public.storage_bookings for each row execute function public.set_updated_at();

insert into public.storage_catalog_items(name, storage_band, description, daily_rate_ngn, weekly_rate_ngn, monthly_rate_ngn, sort_order) values
 ('Documents / Files','small','Paper records and document boxes.',300,1500,5000,10),('Small Bag','small','Personal handbag or small travel bag.',300,1500,5000,20),('Small Carton / Box','small','Small carton or box.',300,1500,5000,30),
 ('Large Carton','medium','Standard moving carton.',500,2500,8000,40),('Suitcase / Travel Bag','medium','Suitcase or travel bag.',500,2500,8000,50),('Sack / Bag','medium','Large sack or bag.',500,2500,8000,60),('Small Appliance','medium','Compact household appliance.',500,2500,8000,70),
 ('Chair','large','Single household chair.',800,4000,12000,80),('Standing Fan','large','Standing fan.',800,4000,12000,90),('Larger Appliance','large','Larger household appliance.',800,4000,12000,100),
 ('Small Furniture','xl','Base price; operations may review dimensions.',1500,7000,20000,110),('Business Stock / Inventory','xl','Base price; subject to review.',1500,7000,20000,120),('Other Item','xl','Describe the item for operations review.',1500,7000,20000,130)
on conflict(name) do nothing;
update public.storage_catalog_items set requires_review=true, is_other=true where name='Other Item';

alter table public.storage_facilities enable row level security;
alter table public.storage_catalog_items enable row level security;
alter table public.storage_bookings enable row level security;
alter table public.storage_booking_extensions enable row level security;
revoke all on public.storage_facilities, public.storage_catalog_items, public.storage_bookings, public.storage_booking_extensions from anon, authenticated;
create policy "Storage customers read active catalogue" on public.storage_catalog_items for select using (is_active or public.current_user_role() = 'admin');
create policy "Storage customers read own bookings" on public.storage_bookings for select using (customer_id = auth.uid() or public.current_user_role() = 'admin');
create policy "Storage customers read own extensions" on public.storage_booking_extensions for select using (exists (select 1 from public.storage_bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.current_user_role()='admin')));

commit;
