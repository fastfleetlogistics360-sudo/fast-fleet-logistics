-- Fast Fleets 360: Heavy Logistics request queue.
-- Run this migration in Supabase before deploying the Heavy Logistics service.

begin;

create table if not exists public.heavy_logistics_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique,
  customer_id uuid not null references public.users(id) on delete cascade,
  category text not null check (category in ('building_materials', 'furniture', 'office_equipment', 'farm_produce', 'bulk_goods', 'other_heavy_items')),
  item_type text not null,
  quantity text not null,
  pickup_address text not null,
  pickup_access text not null default 'not_sure' check (pickup_access in ('easy', 'narrow', 'roadside_transfer', 'not_sure')),
  dropoff_address text not null,
  dropoff_access text not null default 'not_sure' check (dropoff_access in ('easy', 'narrow', 'roadside_transfer', 'not_sure')),
  contact_name text not null,
  contact_phone text not null,
  preferred_pickup_at timestamptz,
  pickup_window text,
  instructions text,
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'quoted', 'scheduled', 'vehicle_assigned', 'in_transit', 'completed', 'cancelled')),
  quoted_price_ngn numeric,
  internal_notes text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists heavy_logistics_requests_customer_idx on public.heavy_logistics_requests(customer_id, created_at desc);
create index if not exists heavy_logistics_requests_status_idx on public.heavy_logistics_requests(status, created_at desc);

drop trigger if exists heavy_logistics_requests_set_updated_at on public.heavy_logistics_requests;
create trigger heavy_logistics_requests_set_updated_at
before update on public.heavy_logistics_requests
for each row execute function public.set_updated_at();

alter table public.heavy_logistics_requests enable row level security;

drop policy if exists "Customers and admins read heavy logistics requests" on public.heavy_logistics_requests;
create policy "Customers and admins read heavy logistics requests"
  on public.heavy_logistics_requests for select
  using (customer_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Customers create heavy logistics requests" on public.heavy_logistics_requests;
create policy "Customers create heavy logistics requests"
  on public.heavy_logistics_requests for insert
  with check (customer_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Admins update heavy logistics requests" on public.heavy_logistics_requests;
create policy "Admins update heavy logistics requests"
  on public.heavy_logistics_requests for update
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

commit;
