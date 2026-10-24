-- Vendor Dispatch: isolated restaurant logbook and daily settlement ledger.
-- All amounts are stored in Kobo to keep arithmetic exact.

create table if not exists public.vendor_dispatch_authorizations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.business_profiles(id) on delete restrict,
  assigned_cyclist_id uuid references public.rider_profiles(id) on delete set null,
  authorization_status text not null default 'active' check (authorization_status in ('active', 'revoked')),
  authorized_by uuid references public.users(id) on delete set null,
  authorized_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_dispatch_daily_settlements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.business_profiles(id) on delete restrict,
  business_date date not null,
  delivery_count integer not null default 0 check (delivery_count >= 0),
  total_delivery_fees_kobo bigint not null default 0 check (total_delivery_fees_kobo >= 0),
  settlement_status text not null default 'awaiting_payment' check (settlement_status in ('awaiting_payment', 'settled', 'corrected')),
  closed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, business_date)
);

create table if not exists public.vendor_dispatch_deliveries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.business_profiles(id) on delete restrict,
  cyclist_id uuid references public.rider_profiles(id) on delete set null,
  destination text not null check (char_length(trim(destination)) between 2 and 500),
  delivery_fee_kobo bigint not null check (delivery_fee_kobo > 0),
  business_date date not null,
  delivery_status text not null default 'recorded' check (delivery_status in ('recorded', 'verified_completed', 'corrected')),
  daily_settlement_id uuid references public.vendor_dispatch_daily_settlements(id) on delete restrict,
  client_submission_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, client_submission_id)
);

create table if not exists public.vendor_dispatch_audit_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.business_profiles(id) on delete restrict,
  delivery_id uuid references public.vendor_dispatch_deliveries(id) on delete restrict,
  settlement_id uuid references public.vendor_dispatch_daily_settlements(id) on delete restrict,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vendor_dispatch_deliveries_restaurant_date_idx on public.vendor_dispatch_deliveries(restaurant_id, business_date, created_at desc);
create index if not exists vendor_dispatch_settlements_restaurant_date_idx on public.vendor_dispatch_daily_settlements(restaurant_id, business_date desc);
create index if not exists vendor_dispatch_audit_restaurant_idx on public.vendor_dispatch_audit_events(restaurant_id, created_at desc);

drop trigger if exists vendor_dispatch_authorizations_updated_at on public.vendor_dispatch_authorizations;
create trigger vendor_dispatch_authorizations_updated_at before update on public.vendor_dispatch_authorizations for each row execute function public.set_updated_at();
drop trigger if exists vendor_dispatch_settlements_updated_at on public.vendor_dispatch_daily_settlements;
create trigger vendor_dispatch_settlements_updated_at before update on public.vendor_dispatch_daily_settlements for each row execute function public.set_updated_at();
drop trigger if exists vendor_dispatch_deliveries_updated_at on public.vendor_dispatch_deliveries;
create trigger vendor_dispatch_deliveries_updated_at before update on public.vendor_dispatch_deliveries for each row execute function public.set_updated_at();

-- API routes use the service role and pass the authenticated business user.
-- These functions serialize deliveries and closing through the authorization row.
create or replace function public.vendor_dispatch_add_delivery(
  p_actor_user_id uuid, p_destination text, p_fee_kobo bigint, p_client_submission_id uuid
) returns public.vendor_dispatch_deliveries
language plpgsql security definer set search_path = public as $$
declare v_restaurant public.business_profiles%rowtype; v_auth public.vendor_dispatch_authorizations%rowtype; v_day date := (now() at time zone 'Africa/Lagos')::date; v_delivery public.vendor_dispatch_deliveries%rowtype;
begin
  select * into v_restaurant from public.business_profiles where user_id = p_actor_user_id;
  if v_restaurant.id is null then raise exception 'Business account required' using errcode = '42501'; end if;
  select * into v_auth from public.vendor_dispatch_authorizations where restaurant_id = v_restaurant.id for update;
  if v_auth.id is null or v_auth.authorization_status <> 'active' or v_auth.assigned_cyclist_id is null then raise exception 'Vendor Dispatch is not authorized for this restaurant' using errcode = '42501'; end if;
  if exists(select 1 from public.vendor_dispatch_daily_settlements where restaurant_id=v_restaurant.id and business_date=v_day) then raise exception 'This business day is closed' using errcode = '23505'; end if;
  insert into public.vendor_dispatch_deliveries(restaurant_id, cyclist_id, destination, delivery_fee_kobo, business_date, client_submission_id)
  values(v_restaurant.id, v_auth.assigned_cyclist_id, trim(p_destination), p_fee_kobo, v_day, p_client_submission_id)
  on conflict (restaurant_id, client_submission_id) do update set client_submission_id = excluded.client_submission_id
  returning * into v_delivery;
  return v_delivery;
end $$;

create or replace function public.vendor_dispatch_close_day(p_actor_user_id uuid, p_business_date date)
returns public.vendor_dispatch_daily_settlements
language plpgsql security definer set search_path = public as $$
declare v_restaurant public.business_profiles%rowtype; v_auth public.vendor_dispatch_authorizations%rowtype; v_settlement public.vendor_dispatch_daily_settlements%rowtype; v_count integer; v_total bigint;
begin
  if p_business_date <> (now() at time zone 'Africa/Lagos')::date then raise exception 'Only the current Lagos business day can be closed' using errcode = '22023'; end if;
  select * into v_restaurant from public.business_profiles where user_id=p_actor_user_id;
  if v_restaurant.id is null then raise exception 'Business account required' using errcode='42501'; end if;
  select * into v_auth from public.vendor_dispatch_authorizations where restaurant_id=v_restaurant.id for update;
  if v_auth.id is null or v_auth.authorization_status <> 'active' then raise exception 'Vendor Dispatch is not authorized for this restaurant' using errcode='42501'; end if;
  select * into v_settlement from public.vendor_dispatch_daily_settlements where restaurant_id=v_restaurant.id and business_date=p_business_date;
  if v_settlement.id is not null then return v_settlement; end if;
  select count(*)::integer, coalesce(sum(delivery_fee_kobo),0) into v_count, v_total from public.vendor_dispatch_deliveries where restaurant_id=v_restaurant.id and business_date=p_business_date and daily_settlement_id is null;
  insert into public.vendor_dispatch_daily_settlements(restaurant_id,business_date,delivery_count,total_delivery_fees_kobo) values(v_restaurant.id,p_business_date,v_count,v_total) returning * into v_settlement;
  update public.vendor_dispatch_deliveries set daily_settlement_id=v_settlement.id where restaurant_id=v_restaurant.id and business_date=p_business_date and daily_settlement_id is null;
  insert into public.vendor_dispatch_audit_events(restaurant_id, settlement_id, actor_id, action) values(v_restaurant.id,v_settlement.id,p_actor_user_id,'day_closed');
  return v_settlement;
end $$;

alter table public.vendor_dispatch_authorizations enable row level security;
alter table public.vendor_dispatch_deliveries enable row level security;
alter table public.vendor_dispatch_daily_settlements enable row level security;
alter table public.vendor_dispatch_audit_events enable row level security;
revoke all on function public.vendor_dispatch_add_delivery(uuid,text,bigint,uuid) from public;
revoke all on function public.vendor_dispatch_close_day(uuid,date) from public;
grant execute on function public.vendor_dispatch_add_delivery(uuid,text,bigint,uuid) to service_role;
grant execute on function public.vendor_dispatch_close_day(uuid,date) to service_role;
