-- FastFleet Logistics Supabase schema
-- Run in the Supabase SQL editor, then set NEXT_PUBLIC_SUPABASE_URL and
-- NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local for the Next.js app.
-- The legacy user_profiles and delivery_orders tables are preserved at the
-- bottom so the original static HTML app can keep working while the Next.js
-- platform is adopted.

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('customer', 'rider', 'business', 'admin');
exception when duplicate_object then null;
end $$;

alter type public.user_role add value if not exists 'business';

do $$ begin
  create type public.vehicle_type as enum ('bike', 'car', 'van');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.delivery_speed as enum ('standard', 'same_day', 'express', 'priority', 'scheduled', 'interstate');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.delivery_status as enum (
    'draft',
    'quoted',
    'pending_payment',
    'searching',
    'accepted',
    'rider_arrived',
    'picked_up',
    'in_transit',
    'delivered',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.rider_application_status as enum (
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'more_info_required'
  );
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text unique,
  email text,
  role public.user_role not null default 'customer',
  account_type text generated always as (role::text) stored,
  avatar_url text,
  default_zone text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  account_type public.user_role not null default 'customer',
  avatar_url text,
  lga text,
  is_admin boolean not null default false,
  kyc_status text not null default 'pending_review' check (kyc_status in ('pending_review', 'approved', 'rejected')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_id_matches_user_id check (id = user_id)
);

alter table if exists public.profiles
  add column if not exists lga text,
  add column if not exists is_admin boolean not null default false,
  add column if not exists kyc_status text not null default 'pending_review',
  add column if not exists deleted_at timestamptz;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role::text from public.users where id = auth.uid()), 'customer');
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false);
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_role public.user_role;
begin
  next_role := case
    when new.raw_user_meta_data ->> 'role' in ('customer', 'rider', 'business', 'admin')
      then (new.raw_user_meta_data ->> 'role')::public.user_role
    when new.raw_user_meta_data ->> 'account_type' in ('customer', 'rider', 'business', 'admin')
      then (new.raw_user_meta_data ->> 'account_type')::public.user_role
    else 'customer'::public.user_role
  end;

  insert into public.users (id, full_name, phone, email, role, default_zone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone,
    new.email,
    next_role,
    coalesce(new.raw_user_meta_data ->> 'default_zone', new.raw_user_meta_data ->> 'state', 'Lagos')
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = coalesce(excluded.phone, public.users.phone),
    email = coalesce(excluded.email, public.users.email),
    role = excluded.role,
    default_zone = coalesce(excluded.default_zone, public.users.default_zone),
    updated_at = now();

  insert into public.profiles (id, user_id, full_name, phone, email, account_type)
  values (
    new.id,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone,
    new.email,
    next_role
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    email = coalesce(excluded.email, public.profiles.email),
    account_type = excluded.account_type,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create table if not exists public.rider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  application_status public.rider_application_status not null default 'submitted',
  address text,
  operating_zone text,
  vehicle_type public.vehicle_type,
  vehicle_make text,
  vehicle_model text,
  vehicle_year integer,
  plate_number text,
  vehicle_color text,
  bank_name text,
  bank_code text,
  account_number text,
  account_name text,
  rating numeric(3,2) not null default 5.00,
  acceptance_rate numeric(5,2) not null default 100.00,
  completed_deliveries integer not null default 0,
  level text not null default 'Bronze' check (level in ('Bronze', 'Silver', 'Gold', 'Elite')),
  online boolean not null default false,
  suspended_at timestamptz,
  suspension_reason text,
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists rider_profiles_set_updated_at on public.rider_profiles;
create trigger rider_profiles_set_updated_at
before update on public.rider_profiles
for each row execute function public.set_updated_at();

alter table if exists public.rider_profiles
  add column if not exists vehicle_make text,
  add column if not exists vehicle_model text,
  add column if not exists vehicle_year integer,
  add column if not exists bank_code text;

create table if not exists public.rider_documents (
  id uuid primary key default gen_random_uuid(),
  rider_profile_id uuid not null references public.rider_profiles(id) on delete cascade,
  document_type text not null check (document_type in ('nin', 'license', 'vehicle_papers', 'selfie', 'profile_photo', 'government_id', 'drivers_licence', 'vehicle_registration', 'insurance_certificate', 'guarantor_letter')),
  file_url text,
  storage_path text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'more_info_required')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists rider_documents_set_updated_at on public.rider_documents;
create trigger rider_documents_set_updated_at
before update on public.rider_documents
for each row execute function public.set_updated_at();

do $$ begin
  alter table public.rider_documents drop constraint rider_documents_document_type_check;
exception when undefined_object then null;
end $$;

alter table public.rider_documents
  add constraint rider_documents_document_type_check
  check (document_type in ('nin', 'license', 'vehicle_papers', 'selfie', 'profile_photo', 'government_id', 'drivers_licence', 'vehicle_registration', 'insurance_certificate', 'guarantor_letter'));

create table if not exists public.rider_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  rider_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'pending_review' check (status in ('pending_review', 'under_review', 'approved', 'rejected', 'more_info_required')),
  full_name text not null,
  phone text not null,
  email text not null,
  lga text not null,
  vehicle_type text not null check (vehicle_type in ('motorcycle', 'tricycle', 'car', 'van')),
  vehicle_make text not null,
  vehicle_model text not null,
  vehicle_year integer not null,
  plate_number text not null,
  vehicle_color text not null,
  government_id_type text not null check (government_id_type in ('nin_slip', 'voters_card', 'drivers_licence', 'passport')),
  bank_name text not null,
  bank_code text not null,
  account_number text not null,
  account_name text not null,
  nin_url text,
  licence_url text,
  vehicle_reg_url text,
  insurance_url text,
  guarantor_url text,
  rejection_reason text,
  documents jsonb not null default '[]'::jsonb,
  agreement_accepted_at timestamptz not null,
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.rider_applications
  add column if not exists rider_id uuid references public.profiles(id) on delete cascade,
  add column if not exists nin_url text,
  add column if not exists licence_url text,
  add column if not exists vehicle_reg_url text,
  add column if not exists insurance_url text,
  add column if not exists guarantor_url text,
  add column if not exists rejection_reason text;

alter table if exists public.rider_applications
  drop column if exists bvn_encrypted,
  drop column if exists bvn_hash;

insert into public.rider_profiles (
  user_id,
  application_status,
  address,
  operating_zone,
  vehicle_type,
  vehicle_make,
  vehicle_model,
  vehicle_year,
  plate_number,
  vehicle_color,
  bank_name,
  account_number,
  account_name,
  online,
  reviewed_at
)
select distinct on (application.user_id)
  application.user_id,
  'approved'::public.rider_application_status,
  application.lga,
  application.lga,
  case
    when application.vehicle_type in ('car', 'van') then application.vehicle_type::public.vehicle_type
    else 'bike'::public.vehicle_type
  end,
  application.vehicle_make,
  application.vehicle_model,
  application.vehicle_year,
  application.plate_number,
  application.vehicle_color,
  application.bank_name,
  application.account_number,
  application.account_name,
  true,
  coalesce(application.reviewed_at, now())
from public.rider_applications application
where application.status = 'approved'
order by application.user_id, application.updated_at desc, application.created_at desc
on conflict (user_id) do update
set application_status = 'approved'::public.rider_application_status,
    address = coalesce(excluded.address, public.rider_profiles.address),
    operating_zone = coalesce(excluded.operating_zone, public.rider_profiles.operating_zone),
    vehicle_type = excluded.vehicle_type,
    vehicle_make = coalesce(excluded.vehicle_make, public.rider_profiles.vehicle_make),
    vehicle_model = coalesce(excluded.vehicle_model, public.rider_profiles.vehicle_model),
    vehicle_year = coalesce(excluded.vehicle_year, public.rider_profiles.vehicle_year),
    plate_number = coalesce(excluded.plate_number, public.rider_profiles.plate_number),
    vehicle_color = coalesce(excluded.vehicle_color, public.rider_profiles.vehicle_color),
    bank_name = coalesce(excluded.bank_name, public.rider_profiles.bank_name),
    account_number = coalesce(excluded.account_number, public.rider_profiles.account_number),
    account_name = coalesce(excluded.account_name, public.rider_profiles.account_name),
    online = true,
    reviewed_at = coalesce(public.rider_profiles.reviewed_at, excluded.reviewed_at),
    updated_at = now();

drop trigger if exists rider_applications_set_updated_at on public.rider_applications;
create trigger rider_applications_set_updated_at
before update on public.rider_applications
for each row execute function public.set_updated_at();

create table if not exists public.saved_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  label text not null,
  address text not null,
  latitude numeric,
  longitude numeric,
  lat numeric,
  lng numeric,
  contact_name text,
  contact_phone text,
  created_at timestamptz not null default now()
);

alter table if exists public.saved_addresses
  add column if not exists lat numeric,
  add column if not exists lng numeric;

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  business_name text not null,
  contact_name text,
  phone text,
  email text,
  industry text,
  business_type text,
  commission_rate numeric(5,2),
  dispatch_volume text,
  pickup_address text,
  cac_number text,
  registration_status text not null default 'submitted' check (registration_status in ('submitted', 'active', 'paused', 'rejected')),
  rejection_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.business_profiles
  add column if not exists business_type text,
  add column if not exists commission_rate numeric(5,2),
  add column if not exists cac_number text,
  add column if not exists rejection_reason text,
  add column if not exists reviewed_at timestamptz;

drop trigger if exists business_profiles_set_updated_at on public.business_profiles;
create trigger business_profiles_set_updated_at
before update on public.business_profiles
for each row execute function public.set_updated_at();

create table if not exists public.business_documents (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  document_type text not null check (document_type in ('storefront_photo', 'cac_certificate', 'director_government_id', 'address_proof')),
  file_url text,
  storage_path text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_profile_id, document_type)
);

drop trigger if exists business_documents_set_updated_at on public.business_documents;
create trigger business_documents_set_updated_at
before update on public.business_documents
for each row execute function public.set_updated_at();

create table if not exists public.business_team_members (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  invited_by uuid references public.users(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  email text not null,
  role text not null default 'viewer' check (role in ('dispatcher', 'viewer')),
  status text not null default 'invited' check (status in ('invited', 'active', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_profile_id, email)
);

drop trigger if exists business_team_members_set_updated_at on public.business_team_members;
create trigger business_team_members_set_updated_at
before update on public.business_team_members
for each row execute function public.set_updated_at();

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_code text not null unique,
  customer_id uuid not null references public.users(id) on delete cascade,
  rider_id uuid references public.rider_profiles(id),
  pickup_address text not null,
  pickup_contact text,
  pickup_latitude numeric,
  pickup_longitude numeric,
  dropoff_address text not null,
  dropoff_contact text,
  dropoff_latitude numeric,
  dropoff_longitude numeric,
  parcel_type text not null,
  vehicle_type public.vehicle_type not null,
  delivery_speed public.delivery_speed not null,
  payment_method text not null default 'card' check (payment_method in ('card', 'wallet', 'transfer')),
  status public.delivery_status not null default 'draft',
  price_ngn numeric not null default 0,
  distance_km numeric not null default 0,
  eta_minutes integer not null default 0,
  scheduled_at timestamptz,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  proof_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists deliveries_set_updated_at on public.deliveries;
create trigger deliveries_set_updated_at
before update on public.deliveries
for each row execute function public.set_updated_at();

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  rider_id uuid references public.profiles(id),
  business_id uuid references public.profiles(id),
  pickup_address text not null,
  dropoff_address text not null,
  package_type text not null,
  vehicle_type text not null check (vehicle_type in ('any', 'bike', 'car', 'van')),
  status text not null default 'pending' check (status in ('pending', 'assigned', 'picked_up', 'delivered', 'cancelled')),
  amount numeric not null default 0,
  payment_method text not null default 'wallet',
  payment_status text not null default 'pending',
  proof_of_delivery_url text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_rider_id_idx on public.orders(rider_id);
create index if not exists orders_business_id_idx on public.orders(business_id);
create index if not exists orders_status_idx on public.orders(status, created_at desc);

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  actor_id uuid references public.users(id),
  status public.delivery_status not null,
  title text not null,
  body text,
  latitude numeric,
  longitude numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.rider_locations (
  rider_profile_id uuid primary key references public.rider_profiles(id) on delete cascade,
  zone text,
  latitude numeric not null,
  longitude numeric not null,
  heading numeric,
  speed numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_locations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.deliveries(id) on delete cascade,
  rider_id uuid not null references public.rider_profiles(id) on delete cascade,
  latitude numeric not null,
  longitude numeric not null,
  heading numeric,
  speed numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

alter table if exists public.delivery_locations
  add column if not exists order_id uuid references public.deliveries(id) on delete cascade,
  add column if not exists rider_id uuid references public.rider_profiles(id) on delete cascade,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists heading numeric,
  add column if not exists speed numeric,
  add column if not exists status text not null default 'active',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists delivery_locations_set_updated_at on public.delivery_locations;
create trigger delivery_locations_set_updated_at
before update on public.delivery_locations
for each row execute function public.set_updated_at();

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  wallet_type text not null check (wallet_type in ('customer', 'rider', 'platform')),
  balance_ngn numeric not null default 0,
  balance numeric not null default 0,
  currency text not null default 'NGN',
  locked_balance_ngn numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, wallet_type)
);

alter table if exists public.wallets
  add column if not exists balance numeric not null default 0,
  add column if not exists currency text not null default 'NGN';

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  delivery_id uuid references public.deliveries(id),
  transaction_type text not null check (transaction_type in ('wallet_funding', 'delivery_payment', 'rider_earning', 'withdrawal', 'refund', 'commission')),
  type text,
  amount_ngn numeric not null,
  amount numeric,
  status text not null default 'pending' check (status in ('pending', 'successful', 'failed', 'reversed')),
  provider text,
  provider_reference text,
  reference text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.transactions
  add column if not exists type text,
  add column if not exists amount numeric,
  add column if not exists reference text,
  add column if not exists description text;

create unique index if not exists transactions_provider_reference_idx
  on public.transactions(provider_reference);

create table if not exists public.company_transaction_logs (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  category text not null check (
    category in (
      'vehicle_maintenance',
      'site_maintenance',
      'delivery_income',
      'fuel',
      'payroll',
      'rider_payout',
      'office_expense',
      'software',
      'tax',
      'insurance',
      'licensing_permits',
      'rent_utilities',
      'marketing',
      'customer_refund',
      'supplier_payment',
      'asset_purchase',
      'other'
    )
  ),
  direction text not null check (direction in ('income', 'expense', 'transfer')),
  amount_ngn numeric not null check (amount_ngn >= 0),
  title text not null,
  counterparty text,
  reference text,
  payment_method text,
  status text not null default 'pending' check (status in ('pending', 'cleared', 'flagged')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.company_transaction_logs
  drop constraint if exists company_transaction_logs_category_check;

alter table if exists public.company_transaction_logs
  add constraint company_transaction_logs_category_check check (
    category in (
      'vehicle_maintenance',
      'site_maintenance',
      'delivery_income',
      'fuel',
      'payroll',
      'rider_payout',
      'office_expense',
      'software',
      'tax',
      'insurance',
      'licensing_permits',
      'rent_utilities',
      'marketing',
      'customer_refund',
      'supplier_payment',
      'asset_purchase',
      'other'
    )
  );

drop trigger if exists company_transaction_logs_set_updated_at on public.company_transaction_logs;
create trigger company_transaction_logs_set_updated_at
before update on public.company_transaction_logs
for each row execute function public.set_updated_at();

create or replace function public.ensure_wallet(next_user_id uuid, next_wallet_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  next_wallet_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if next_wallet_type not in ('customer', 'rider', 'platform') then
    raise exception 'Invalid wallet type';
  end if;

  if next_wallet_type = 'platform' and public.current_user_role() <> 'admin' then
    raise exception 'Only admins can manage platform wallets';
  end if;

  if auth.uid() <> next_user_id and public.current_user_role() <> 'admin' then
    raise exception 'Not allowed to manage this wallet';
  end if;

  insert into public.wallets (user_id, wallet_type)
  values (next_user_id, next_wallet_type)
  on conflict (user_id, wallet_type) do update set updated_at = now()
  returning id into next_wallet_id;

  return next_wallet_id;
end;
$$;

create or replace function public.create_wallet_funding(
  next_user_id uuid,
  next_wallet_type text,
  next_amount_ngn numeric,
  next_provider text,
  next_provider_reference text,
  next_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  next_wallet_id uuid;
  next_transaction_id uuid;
begin
  if next_amount_ngn < 500 then
    raise exception 'Wallet funding amount is too low';
  end if;

  next_wallet_id := public.ensure_wallet(next_user_id, next_wallet_type);

  insert into public.transactions (
    wallet_id,
    transaction_type,
    amount_ngn,
    status,
    provider,
    provider_reference,
    metadata
  )
  values (
    next_wallet_id,
    'wallet_funding',
    next_amount_ngn,
    'pending',
    next_provider,
    next_provider_reference,
    coalesce(next_metadata, '{}'::jsonb)
  )
  on conflict (provider_reference) do update set
    status = case when public.transactions.status = 'successful' then 'successful' else 'pending' end,
    metadata = public.transactions.metadata || excluded.metadata
  returning id into next_transaction_id;

  return next_transaction_id;
end;
$$;

create or replace function public.complete_wallet_funding(
  next_provider_reference text,
  next_amount_ngn numeric,
  next_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_transaction public.transactions%rowtype;
  target_wallet public.wallets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_transaction
  from public.transactions
  where provider_reference = next_provider_reference
    and transaction_type = 'wallet_funding'
  for update;

  if target_transaction.id is null then
    raise exception 'Wallet funding reference not found';
  end if;

  select * into target_wallet
  from public.wallets
  where id = target_transaction.wallet_id
  for update;

  if target_wallet.user_id <> auth.uid() and public.current_user_role() <> 'admin' then
    raise exception 'Not allowed to verify this wallet funding';
  end if;

  if target_transaction.amount_ngn <> next_amount_ngn then
    raise exception 'Payment amount mismatch';
  end if;

  if target_transaction.status = 'successful' then
    return target_wallet.id;
  end if;

  update public.transactions
  set status = 'successful',
      metadata = metadata || coalesce(next_metadata, '{}'::jsonb)
  where id = target_transaction.id;

  update public.wallets
  set balance_ngn = balance_ngn + target_transaction.amount_ngn,
      updated_at = now()
  where id = target_wallet.id;

  return target_wallet.id;
end;
$$;

create or replace function public.mark_wallet_funding_failed(
  next_provider_reference text,
  next_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_transaction public.transactions%rowtype;
  target_wallet public.wallets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_transaction
  from public.transactions
  where provider_reference = next_provider_reference
    and transaction_type = 'wallet_funding'
  for update;

  if target_transaction.id is null then
    raise exception 'Wallet funding reference not found';
  end if;

  select * into target_wallet
  from public.wallets
  where id = target_transaction.wallet_id;

  if target_wallet.user_id <> auth.uid() and public.current_user_role() <> 'admin' then
    raise exception 'Not allowed to update this wallet funding';
  end if;

  if target_transaction.status = 'successful' then
    return target_transaction.id;
  end if;

  update public.transactions
  set status = 'failed',
      metadata = metadata || coalesce(next_metadata, '{}'::jsonb)
  where id = target_transaction.id;

  return target_transaction.id;
end;
$$;

create or replace function public.pay_delivery_from_wallet(
  target_delivery_id uuid,
  next_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_delivery public.deliveries%rowtype;
  target_wallet public.wallets%rowtype;
  existing_transaction_id uuid;
  next_transaction_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_delivery
  from public.deliveries
  where id = target_delivery_id
  for update;

  if target_delivery.id is null then
    raise exception 'Delivery not found';
  end if;

  if target_delivery.customer_id <> auth.uid() and public.current_user_role() <> 'admin' then
    raise exception 'Not allowed to pay for this delivery';
  end if;

  if target_delivery.payment_method <> 'wallet' then
    raise exception 'This delivery is not set to wallet payment';
  end if;

  select id into existing_transaction_id
  from public.transactions
  where delivery_id = target_delivery.id
    and transaction_type = 'delivery_payment'
    and status = 'successful'
  limit 1;

  if existing_transaction_id is not null then
    return existing_transaction_id;
  end if;

  select * into target_wallet
  from public.wallets
  where user_id = target_delivery.customer_id
    and wallet_type = 'customer'
  for update;

  if target_wallet.id is null then
    raise exception 'Customer wallet not found. Top up your wallet before checkout';
  end if;

  if target_wallet.balance_ngn < target_delivery.price_ngn then
    raise exception 'Insufficient wallet balance for this checkout payment';
  end if;

  update public.wallets
  set balance_ngn = balance_ngn - target_delivery.price_ngn,
      updated_at = now()
  where id = target_wallet.id;

  insert into public.transactions (
    wallet_id,
    delivery_id,
    transaction_type,
    amount_ngn,
    status,
    provider,
    provider_reference,
    metadata
  )
  values (
    target_wallet.id,
    target_delivery.id,
    'delivery_payment',
    target_delivery.price_ngn * -1,
    'successful',
    'fastfleet_wallet',
    target_delivery.delivery_code || '-wallet-checkout',
    coalesce(next_metadata, '{}'::jsonb)
  )
  returning id into next_transaction_id;

  update public.deliveries
  set status = 'searching',
      metadata = metadata || jsonb_build_object('wallet_paid_at', now()) || coalesce(next_metadata, '{}'::jsonb),
      updated_at = now()
  where id = target_delivery.id;

  return next_transaction_id;
end;
$$;

create or replace function public.assign_next_delivery_to_rider(target_rider_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_rider public.rider_profiles%rowtype;
  target_delivery public.deliveries%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_rider
  from public.rider_profiles
  where id = target_rider_profile_id
  for update;

  if target_rider.id is null then
    raise exception 'Rider profile not found';
  end if;

  if target_rider.user_id <> auth.uid() and public.current_user_role() <> 'admin' then
    raise exception 'Not allowed to assign jobs for this rider';
  end if;

  if target_rider.application_status <> 'approved' then
    return null;
  end if;

  update public.rider_profiles
  set online = true,
      updated_at = now()
  where id = target_rider.id;

  select * into target_delivery
  from public.deliveries
  where status = 'searching'
    and rider_id is null
    and vehicle_type = target_rider.vehicle_type
  order by
    case
      when target_rider.operating_zone is not null
       and (
        pickup_address ilike '%' || split_part(target_rider.operating_zone, ' ', 1) || '%'
        or dropoff_address ilike '%' || split_part(target_rider.operating_zone, ' ', 1) || '%'
       )
      then 0
      else 1
    end,
    created_at asc
  limit 1
  for update skip locked;

  if target_delivery.id is null then
    return null;
  end if;

  update public.deliveries
  set metadata = metadata || jsonb_build_object('broadcast_at', now(), 'offer_status', 'broadcast'),
      updated_at = now()
  where id = target_delivery.id;

  insert into public.delivery_events (delivery_id, actor_id, status, title, body)
  values (target_delivery.id, target_rider.user_id, 'searching', 'Driver notified', 'FastFleet offered this delivery to a nearby online driver.');

  return target_delivery.id;
end;
$$;

create or replace function public.accept_delivery_offer(target_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_delivery public.deliveries%rowtype;
  target_rider public.rider_profiles%rowtype;
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

  update public.deliveries
  set status = 'accepted',
      rider_id = target_rider.id,
      accepted_at = coalesce(accepted_at, now()),
      metadata = metadata || jsonb_build_object('offer_status', 'accepted', 'accepted_at', now(), 'accepted_rider_id', target_rider.id),
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

create or replace function public.reject_delivery_offer(target_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_delivery public.deliveries%rowtype;
  target_rider public.rider_profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_rider
  from public.rider_profiles
  where user_id = auth.uid();

  if target_rider.id is null then
    raise exception 'Rider profile not found';
  end if;

  select * into target_delivery
  from public.deliveries
  where id = target_delivery_id
  for update;

  if target_delivery.id is null then
    raise exception 'Delivery not found';
  end if;

  if target_delivery.status <> 'searching' and target_delivery.rider_id is distinct from target_rider.id then
    raise exception 'This dispatch order has been accepted by another rider';
  end if;

  update public.deliveries
  set metadata = metadata
      || jsonb_build_object(
        'offer_status', 'rejected',
        'last_rejected_rider_id', target_rider.id,
        'rejected_at', now(),
        'rejected_rider_ids', coalesce(metadata->'rejected_rider_ids', '[]'::jsonb) || to_jsonb(target_rider.id::text)
      ),
      updated_at = now()
  where id = target_delivery.id;

  insert into public.delivery_events (delivery_id, actor_id, status, title, body)
  values (target_delivery.id, target_rider.user_id, 'searching', 'Driver declined', 'The offer was declined and returned to dispatch.');

  return target_delivery.id;
end;
$$;

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  rider_profile_id uuid not null references public.rider_profiles(id) on delete cascade,
  amount_ngn numeric not null check (amount_ngn >= 3000 and amount_ngn <= 200000),
  bank_name text not null,
  account_number text not null,
  account_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  rejection_reason text,
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.withdrawal_requests
  add column if not exists rejection_reason text,
  add column if not exists paid_at timestamptz;

alter table public.withdrawal_requests
  drop constraint if exists withdrawal_requests_amount_ngn_check;

alter table public.withdrawal_requests
  add constraint withdrawal_requests_amount_ngn_check check (amount_ngn >= 3000 and amount_ngn <= 200000);

drop trigger if exists withdrawal_requests_set_updated_at on public.withdrawal_requests;
create trigger withdrawal_requests_set_updated_at
before update on public.withdrawal_requests
for each row execute function public.set_updated_at();

create table if not exists public.platform_launch_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  status text not null default 'waitlist' check (status in ('active', 'live', 'beta', 'waitlist', 'paused')),
  launched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_launch_states
  drop constraint if exists platform_launch_states_status_check;

alter table public.platform_launch_states
  add constraint platform_launch_states_status_check
  check (status in ('active', 'live', 'beta', 'waitlist', 'paused'));

drop trigger if exists platform_launch_states_set_updated_at on public.platform_launch_states;
create trigger platform_launch_states_set_updated_at
before update on public.platform_launch_states
for each row execute function public.set_updated_at();

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists platform_settings_set_updated_at on public.platform_settings;
create trigger platform_settings_set_updated_at
before update on public.platform_settings
for each row execute function public.set_updated_at();

create or replace function public.create_withdrawal_request(
  target_rider_profile_id uuid,
  next_amount_ngn numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_rider public.rider_profiles%rowtype;
  target_wallet public.wallets%rowtype;
  last_24h_total numeric;
  next_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_rider
  from public.rider_profiles
  where id = target_rider_profile_id
  for update;

  if target_rider.id is null or target_rider.user_id <> auth.uid() then
    raise exception 'You can only withdraw from your own driver account';
  end if;

  if target_rider.application_status <> 'approved' then
    raise exception 'Your KYC must be approved before withdrawals are enabled';
  end if;

  if next_amount_ngn < 3000 then
    raise exception 'Minimum withdrawal is NGN 3,000';
  end if;

  if next_amount_ngn > 200000 then
    raise exception 'Maximum withdrawal is NGN 200,000 per request';
  end if;

  select coalesce(sum(amount_ngn), 0) into last_24h_total
  from public.withdrawal_requests
  where rider_profile_id = target_rider_profile_id
    and created_at >= now() - interval '24 hours'
    and status <> 'rejected';

  if last_24h_total + next_amount_ngn > 200000 then
    raise exception 'Your 24-hour withdrawal limit is NGN 200,000. The limit resets after 24 hours';
  end if;

  select * into target_wallet
  from public.wallets
  where user_id = target_rider.user_id
    and wallet_type = 'rider'
  for update;

  if target_wallet.id is null then
    raise exception 'Rider wallet not found';
  end if;

  if target_wallet.balance_ngn < next_amount_ngn then
    raise exception 'Insufficient rider wallet balance';
  end if;

  update public.wallets
  set balance_ngn = balance_ngn - next_amount_ngn,
      locked_balance_ngn = locked_balance_ngn + next_amount_ngn,
      updated_at = now()
  where id = target_wallet.id;

  insert into public.withdrawal_requests (
    rider_profile_id,
    amount_ngn,
    bank_name,
    account_number,
    account_name
  )
  values (
    target_rider_profile_id,
    next_amount_ngn,
    coalesce(target_rider.bank_name, 'Bank pending'),
    coalesce(target_rider.account_number, 'Account pending'),
    target_rider.account_name
  )
  returning id into next_request_id;

  insert into public.transactions (wallet_id, transaction_type, amount_ngn, status, provider, metadata)
  values (target_wallet.id, 'withdrawal', next_amount_ngn * -1, 'pending', 'manual_admin_payout', jsonb_build_object('withdrawal_request_id', next_request_id));

  return next_request_id;
end;
$$;

create or replace function public.review_withdrawal_request(
  request_id uuid,
  next_status text,
  rejection_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.withdrawal_requests%rowtype;
  target_rider public.rider_profiles%rowtype;
  target_wallet public.wallets%rowtype;
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only admins can review driver withdrawals';
  end if;

  if next_status not in ('approved', 'rejected', 'paid') then
    raise exception 'Invalid withdrawal review status';
  end if;

  select * into target_request
  from public.withdrawal_requests
  where id = request_id
  for update;

  if target_request.id is null then
    raise exception 'Withdrawal request not found';
  end if;

  if target_request.status in ('rejected', 'paid') then
    raise exception 'This withdrawal request has already been finalized';
  end if;

  if next_status = 'paid' and target_request.status <> 'approved' then
    raise exception 'Approve the withdrawal before marking it as paid';
  end if;

  select * into target_rider
  from public.rider_profiles
  where id = target_request.rider_profile_id;

  select * into target_wallet
  from public.wallets
  where user_id = target_rider.user_id
    and wallet_type = 'rider'
  for update;

  if next_status = 'approved' then
    update public.withdrawal_requests
    set status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = null
    where id = request_id;
  elsif next_status = 'paid' then
    update public.withdrawal_requests
    set status = 'paid',
        reviewed_by = auth.uid(),
        reviewed_at = coalesce(reviewed_at, now()),
        paid_at = now(),
        rejection_reason = null
    where id = request_id;

    update public.wallets
    set locked_balance_ngn = greatest(0, locked_balance_ngn - target_request.amount_ngn),
        updated_at = now()
    where id = target_wallet.id;

    update public.transactions
    set status = 'successful'
    where wallet_id = target_wallet.id
      and transaction_type = 'withdrawal'
      and metadata ->> 'withdrawal_request_id' = request_id::text;
  else
    if coalesce(trim(rejection_note), '') = '' then
      raise exception 'A rejection reason is required';
    end if;

    update public.withdrawal_requests
    set status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = rejection_note
    where id = request_id;

    update public.wallets
    set balance_ngn = balance_ngn + target_request.amount_ngn,
        locked_balance_ngn = greatest(0, locked_balance_ngn - target_request.amount_ngn),
        updated_at = now()
    where id = target_wallet.id;

    update public.transactions
    set status = 'failed'
    where wallet_id = target_wallet.id
      and transaction_type = 'withdrawal'
      and metadata ->> 'withdrawal_request_id' = request_id::text;
  end if;

  return request_id;
end;
$$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null,
  channel text not null check (channel in ('in_app', 'push', 'email')),
  metadata jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table if exists public.notifications
  add column if not exists read boolean not null default false;

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text,
  cta_label text,
  cta_url text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.state_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  email text not null,
  phone text,
  state text not null,
  source text not null default 'dashboard',
  status text not null default 'waiting' check (status in ('waiting', 'contacted', 'launched')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email, state)
);

drop trigger if exists state_waitlist_set_updated_at on public.state_waitlist;
create trigger state_waitlist_set_updated_at
before update on public.state_waitlist
for each row execute function public.set_updated_at();

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  delivery_id uuid references public.deliveries(id),
  contact_name text,
  name text,
  contact_email text,
  email text,
  contact_phone text,
  phone text,
  topic text not null,
  tracking_code text,
  subject text,
  message text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  assigned_admin_id uuid references public.users(id),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.support_tickets
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists tracking_code text,
  add column if not exists admin_notes text;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_type text not null default 'customer' check (sender_type in ('customer', 'admin', 'bot')),
  sender_user_id uuid references public.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  email text,
  reason text,
  status text not null default 'queued' check (status in ('queued', 'reviewing', 'completed', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  admin_notes text
);

create or replace function public.hard_delete_expired_accounts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
  target_record record;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can run account deletion cleanup';
  end if;

  for target_record in
    select user_id
    from public.profiles
    where deleted_at is not null
      and deleted_at <= now() - interval '90 days'
  loop
    delete from auth.users where id = target_record.user_id;
    deleted_count := deleted_count + 1;
  end loop;

  update public.account_deletion_requests
  set status = 'completed',
      reviewed_at = now()
  where user_id is null
     or exists (
      select 1 from public.profiles p
      where p.user_id = account_deletion_requests.user_id
        and p.deleted_at <= now() - interval '90 days'
     );

  return deleted_count;
end;
$$;

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  vehicle_type public.vehicle_type not null,
  zone text not null default 'default',
  base_fare_ngn numeric not null,
  per_km_ngn numeric not null,
  commission_rate numeric(5,2) not null default 18.00,
  surge_multiplier numeric(4,2) not null default 1.00,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle_type, zone)
);

drop trigger if exists pricing_rules_set_updated_at on public.pricing_rules;
create trigger pricing_rules_set_updated_at
before update on public.pricing_rules
for each row execute function public.set_updated_at();

create table if not exists public.fraud_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  delivery_id uuid references public.deliveries(id),
  signal_type text not null,
  risk_score integer not null check (risk_score between 0 and 100),
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists users_role_idx on public.users(role);
create index if not exists users_phone_idx on public.users(phone);
create index if not exists business_profiles_user_id_idx on public.business_profiles(user_id);
create index if not exists profiles_user_id_idx on public.profiles(user_id);
create index if not exists business_profiles_status_idx on public.business_profiles(registration_status);
create index if not exists business_documents_profile_idx on public.business_documents(business_profile_id);
create index if not exists rider_profiles_user_id_idx on public.rider_profiles(user_id);
create index if not exists rider_profiles_status_idx on public.rider_profiles(application_status);
create index if not exists rider_profiles_online_zone_idx on public.rider_profiles(online, operating_zone);
create index if not exists rider_applications_user_id_idx on public.rider_applications(user_id);
create index if not exists rider_applications_status_idx on public.rider_applications(status, created_at desc);
create index if not exists deliveries_customer_id_idx on public.deliveries(customer_id);
create index if not exists deliveries_rider_id_idx on public.deliveries(rider_id);
create index if not exists deliveries_status_idx on public.deliveries(status);
create index if not exists deliveries_code_idx on public.deliveries(delivery_code);
create index if not exists deliveries_created_at_idx on public.deliveries(created_at desc);
create index if not exists notifications_user_read_idx on public.notifications(user_id, read_at);
create index if not exists transactions_wallet_idx on public.transactions(wallet_id, created_at desc);
create index if not exists company_transaction_logs_date_idx on public.company_transaction_logs(entry_date desc, created_at desc);
create index if not exists company_transaction_logs_category_idx on public.company_transaction_logs(category, direction, status);
create index if not exists state_waitlist_state_idx on public.state_waitlist(state, created_at desc);
create index if not exists platform_launch_states_status_idx on public.platform_launch_states(status, state);
create index if not exists platform_settings_updated_idx on public.platform_settings(updated_at desc);
create index if not exists withdrawal_requests_status_idx on public.withdrawal_requests(status, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status, priority);
create index if not exists support_messages_ticket_idx on public.support_messages(ticket_id, created_at);
create index if not exists rider_locations_zone_idx on public.rider_locations(zone, updated_at desc);
create unique index if not exists delivery_locations_order_unique on public.delivery_locations(order_id);
create index if not exists delivery_locations_order_idx on public.delivery_locations(order_id, updated_at desc);
create index if not exists delivery_locations_rider_idx on public.delivery_locations(rider_id, updated_at desc);
create index if not exists business_team_members_business_idx on public.business_team_members(business_profile_id, created_at desc);
create index if not exists business_team_members_email_idx on public.business_team_members(email);

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.business_profiles enable row level security;
alter table public.business_documents enable row level security;
alter table public.business_team_members enable row level security;
alter table public.rider_profiles enable row level security;
alter table public.rider_applications enable row level security;
alter table public.rider_documents enable row level security;
alter table public.saved_addresses enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_events enable row level security;
alter table public.rider_locations enable row level security;
alter table public.delivery_locations enable row level security;
alter table public.wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.company_transaction_logs enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.promotions enable row level security;
alter table public.state_waitlist enable row level security;
alter table public.platform_launch_states enable row level security;
alter table public.platform_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.fraud_signals enable row level security;

drop policy if exists "Users can read own profile or admins read all" on public.users;
create policy "Users can read own profile or admins read all"
  on public.users for select
  using (auth.uid() = id or public.current_user_role() = 'admin');

drop policy if exists "Customers read assigned rider user profile" on public.users;
create policy "Customers read assigned rider user profile"
  on public.users for select
  using (
    auth.uid() = id
    or public.current_user_role() = 'admin'
    or exists (
      select 1
      from public.deliveries d
      join public.rider_profiles rp on rp.id = d.rider_id
      where rp.user_id = users.id
        and d.customer_id = auth.uid()
        and d.status in ('accepted', 'rider_arrived', 'picked_up', 'in_transit', 'delivered')
    )
  );

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.users;
create policy "Users can insert own profile"
  on public.users for insert
  with check (auth.uid() = id);

drop policy if exists "Profiles are readable by owner or admins" on public.profiles;
create policy "Profiles are readable by owner or admins"
  on public.profiles for select
  using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Profiles are inserted by owner" on public.profiles;
create policy "Profiles are inserted by owner"
  on public.profiles for insert
  with check (user_id = auth.uid() and id = auth.uid());

drop policy if exists "Profiles are updated by owner" on public.profiles;
create policy "Profiles are updated by owner"
  on public.profiles for update
  using (user_id = auth.uid() or public.current_user_is_admin())
  with check (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Orders visible to participants and admins" on public.orders;
create policy "Orders visible to participants and admins"
  on public.orders for select
  using (
    customer_id = auth.uid()
    or rider_id = auth.uid()
    or business_id = auth.uid()
    or public.current_user_is_admin()
  );

drop policy if exists "Customers and businesses create own orders" on public.orders;
create policy "Customers and businesses create own orders"
  on public.orders for insert
  with check (customer_id = auth.uid() or business_id = auth.uid());

drop policy if exists "Orders updated by assigned rider or admins" on public.orders;
create policy "Orders updated by assigned rider or admins"
  on public.orders for update
  using (
    rider_id = auth.uid()
    or customer_id = auth.uid()
    or business_id = auth.uid()
    or public.current_user_is_admin()
  )
  with check (
    rider_id = auth.uid()
    or customer_id = auth.uid()
    or business_id = auth.uid()
    or public.current_user_is_admin()
  );

drop policy if exists "Riders manage own rider profile and admins manage all" on public.rider_profiles;
create policy "Riders manage own rider profile and admins manage all"
  on public.rider_profiles for all
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Customers read assigned rider profile" on public.rider_profiles;
create policy "Customers read assigned rider profile"
  on public.rider_profiles for select
  using (
    public.current_user_role() = 'admin'
    or user_id = auth.uid()
    or exists (
      select 1 from public.deliveries d
      where d.rider_id = rider_profiles.id
        and d.customer_id = auth.uid()
        and d.status in ('accepted', 'rider_arrived', 'picked_up', 'in_transit', 'delivered')
    )
  );

drop policy if exists "Rider applications visible to owner and admins" on public.rider_applications;
create policy "Rider applications visible to owner and admins"
  on public.rider_applications for select
  using (user_id = auth.uid() or rider_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Riders create own applications" on public.rider_applications;
create policy "Riders create own applications"
  on public.rider_applications for insert
  with check (user_id = auth.uid());

drop policy if exists "Rider applications updated by owner before review or admins" on public.rider_applications;
create policy "Rider applications updated by owner before review or admins"
  on public.rider_applications for update
  using (public.current_user_is_admin() or (user_id = auth.uid() and status = 'pending_review'))
  with check (public.current_user_is_admin() or (user_id = auth.uid() and status = 'pending_review'));

drop policy if exists "Businesses manage own business profile and admins manage all" on public.business_profiles;
create policy "Businesses manage own business profile and admins manage all"
  on public.business_profiles for all
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Business documents visible to owner and admins" on public.business_documents;
create policy "Business documents visible to owner and admins"
  on public.business_documents for all
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Businesses manage own team members and admins manage all" on public.business_team_members;
create policy "Businesses manage own team members and admins manage all"
  on public.business_team_members for all
  using (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.business_profiles bp
      where bp.id = business_profile_id and bp.user_id = auth.uid()
    )
    or user_id = auth.uid()
  )
  with check (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.business_profiles bp
      where bp.id = business_profile_id and bp.user_id = auth.uid()
    )
    or user_id = auth.uid()
  );

drop policy if exists "Rider documents visible to owner and admins" on public.rider_documents;
create policy "Rider documents visible to owner and admins"
  on public.rider_documents for all
  using (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.rider_profiles rp
      where rp.id = rider_profile_id and rp.user_id = auth.uid()
    )
  )
  with check (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.rider_profiles rp
      where rp.id = rider_profile_id and rp.user_id = auth.uid()
    )
  );

drop policy if exists "Users manage own saved addresses" on public.saved_addresses;
create policy "Users manage own saved addresses"
  on public.saved_addresses for all
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Customers riders and admins read deliveries" on public.deliveries;
create policy "Customers riders and admins read deliveries"
  on public.deliveries for select
 using (
    customer_id = auth.uid()
    or public.current_user_role() = 'admin'
    or (
      rider_id is null
      and status = 'searching'
      and exists (
        select 1 from public.rider_profiles rp
        where rp.user_id = auth.uid()
          and rp.application_status = 'approved'
          and rp.online = true
          and rp.vehicle_type = deliveries.vehicle_type
      )
    )
    or exists (
      select 1 from public.rider_profiles rp
      where rp.id = rider_id and rp.user_id = auth.uid()
    )
  );

drop policy if exists "Customers create own deliveries" on public.deliveries;
create policy "Customers create own deliveries"
  on public.deliveries for insert
  with check (customer_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Delivery updates by assigned rider or admin" on public.deliveries;
create policy "Delivery updates by assigned rider or admin"
  on public.deliveries for update
  using (
    public.current_user_role() = 'admin'
    or customer_id = auth.uid()
    or exists (
      select 1 from public.rider_profiles rp
      where rp.id = rider_id and rp.user_id = auth.uid()
    )
  )
  with check (
    public.current_user_role() = 'admin'
    or customer_id = auth.uid()
    or exists (
      select 1 from public.rider_profiles rp
      where rp.id = rider_id and rp.user_id = auth.uid()
    )
  );

drop policy if exists "Delivery events follow delivery access" on public.delivery_events;
create policy "Delivery events follow delivery access"
  on public.delivery_events for select
  using (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.deliveries d
      where d.id = delivery_id
      and (
        d.customer_id = auth.uid()
        or exists (select 1 from public.rider_profiles rp where rp.id = d.rider_id and rp.user_id = auth.uid())
      )
    )
  );

drop policy if exists "Delivery participants insert timeline events" on public.delivery_events;
create policy "Delivery participants insert timeline events"
  on public.delivery_events for insert
  with check (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.deliveries d
      where d.id = delivery_id
      and (
        d.customer_id = auth.uid()
        or exists (select 1 from public.rider_profiles rp where rp.id = d.rider_id and rp.user_id = auth.uid())
      )
    )
  );

drop policy if exists "Riders update own location and admins read all" on public.rider_locations;
drop policy if exists "Riders manage own location and admins manage all" on public.rider_locations;
drop policy if exists "Customers read assigned rider location" on public.rider_locations;

create policy "Riders manage own location and admins manage all"
  on public.rider_locations for all
  using (
    public.current_user_role() = 'admin'
    or exists (select 1 from public.rider_profiles rp where rp.id = rider_profile_id and rp.user_id = auth.uid())
  )
  with check (
    public.current_user_role() = 'admin'
    or exists (select 1 from public.rider_profiles rp where rp.id = rider_profile_id and rp.user_id = auth.uid())
  );

create policy "Customers read assigned rider location"
  on public.rider_locations for select
  using (
    public.current_user_role() = 'admin'
    or exists (
      select 1
      from public.deliveries d
      where d.rider_id = rider_profile_id
        and d.customer_id = auth.uid()
        and d.status not in ('draft', 'quoted', 'delivered', 'cancelled')
    )
  );

drop policy if exists "Customers read own delivery live location" on public.delivery_locations;
drop policy if exists "Assigned riders write delivery live location" on public.delivery_locations;
drop policy if exists "Assigned riders update delivery live location" on public.delivery_locations;
drop policy if exists "Admins read all delivery live locations" on public.delivery_locations;

create policy "Customers read own delivery live location"
  on public.delivery_locations for select
  using (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.deliveries d
      where d.id = order_id
        and d.customer_id = auth.uid()
    )
    or exists (
      select 1 from public.rider_profiles rp
      where rp.id = rider_id
        and rp.user_id = auth.uid()
    )
  );

create policy "Assigned riders write delivery live location"
  on public.delivery_locations for insert
  with check (
    exists (
      select 1
      from public.deliveries d
      join public.rider_profiles rp on rp.id = d.rider_id
      where d.id = order_id
        and d.rider_id = rider_id
        and rp.user_id = auth.uid()
        and d.status not in ('delivered', 'cancelled')
    )
  );

create policy "Assigned riders update delivery live location"
  on public.delivery_locations for update
  using (
    public.current_user_role() = 'admin'
    or exists (
      select 1
      from public.deliveries d
      join public.rider_profiles rp on rp.id = d.rider_id
      where d.id = order_id
        and d.rider_id = rider_id
        and rp.user_id = auth.uid()
        and d.status not in ('delivered', 'cancelled')
    )
  )
  with check (
    public.current_user_role() = 'admin'
    or exists (
      select 1
      from public.deliveries d
      join public.rider_profiles rp on rp.id = d.rider_id
      where d.id = order_id
        and d.rider_id = rider_id
        and rp.user_id = auth.uid()
        and d.status not in ('delivered', 'cancelled')
    )
  );

drop policy if exists "Wallet owners and admins" on public.wallets;
create policy "Wallet owners and admins"
  on public.wallets for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Transactions visible to wallet owners and admins" on public.transactions;
create policy "Transactions visible to wallet owners and admins"
  on public.transactions for select
  using (
    public.current_user_role() = 'admin'
    or exists (select 1 from public.wallets w where w.id = wallet_id and w.user_id = auth.uid())
  );

drop policy if exists "Admins manage company transaction logs" on public.company_transaction_logs;
create policy "Admins manage company transaction logs"
  on public.company_transaction_logs for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "Users join own state waitlist and admins manage all" on public.state_waitlist;
create policy "Users join own state waitlist and admins manage all"
  on public.state_waitlist for all
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Launch states are readable by all signed in users" on public.platform_launch_states;
create policy "Launch states are readable by all signed in users"
  on public.platform_launch_states for select
  using (auth.uid() is not null or public.current_user_role() = 'admin');

drop policy if exists "Admins manage launch states" on public.platform_launch_states;
create policy "Admins manage launch states"
  on public.platform_launch_states for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "Signed in users read platform settings" on public.platform_settings;
create policy "Signed in users read platform settings"
  on public.platform_settings for select
  using (auth.uid() is not null or public.current_user_role() = 'admin');

drop policy if exists "Admins manage platform settings" on public.platform_settings;
create policy "Admins manage platform settings"
  on public.platform_settings for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "Withdrawal owner and admin access" on public.withdrawal_requests;
create policy "Withdrawal owner and admin access"
  on public.withdrawal_requests for all
  using (
    public.current_user_role() = 'admin'
    or exists (select 1 from public.rider_profiles rp where rp.id = rider_profile_id and rp.user_id = auth.uid())
  )
  with check (
    public.current_user_role() = 'admin'
    or exists (select 1 from public.rider_profiles rp where rp.id = rider_profile_id and rp.user_id = auth.uid())
  );

drop policy if exists "Users manage own notifications" on public.notifications;
create policy "Users manage own notifications"
  on public.notifications for all
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Customers read active promotions" on public.promotions;
create policy "Customers read active promotions"
  on public.promotions for select
  using (active = true or public.current_user_is_admin());

drop policy if exists "Admins manage promotions" on public.promotions;
create policy "Admins manage promotions"
  on public.promotions for all
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions"
  on public.push_subscriptions for all
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Support ticket owner and admin access" on public.support_tickets;
create policy "Support ticket owner and admin access"
  on public.support_tickets for all
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Anyone can create support tickets" on public.support_tickets;
create policy "Anyone can create support tickets"
  on public.support_tickets for insert
  with check (true);

drop policy if exists "Support ticket message owner and admin access" on public.support_messages;
create policy "Support ticket message owner and admin access"
  on public.support_messages for select
  using (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.support_tickets st
      where st.id = ticket_id and st.user_id = auth.uid()
    )
  );

drop policy if exists "Anyone can create support messages" on public.support_messages;
create policy "Anyone can create support messages"
  on public.support_messages for insert
  with check (true);

drop policy if exists "Users create and admins manage deletion requests" on public.account_deletion_requests;
create policy "Users create and admins manage deletion requests"
  on public.account_deletion_requests for all
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Admins manage pricing rules" on public.pricing_rules;
create policy "Admins manage pricing rules"
  on public.pricing_rules for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admins manage fraud signals" on public.fraud_signals;
create policy "Admins manage fraud signals"
  on public.fraud_signals for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

insert into public.pricing_rules (vehicle_type, zone, base_fare_ngn, per_km_ngn, commission_rate)
values
  ('bike', 'default', 1800, 240, 18),
  ('car', 'default', 3600, 360, 18),
  ('van', 'default', 7200, 620, 20),
  ('bike', 'ogun', 2600, 280, 18),
  ('car', 'ogun', 4400, 420, 18),
  ('van', 'ogun', 8400, 700, 20)
on conflict (vehicle_type, zone) do nothing;

insert into public.platform_launch_states (state, status, launched_at)
values
  ('Lagos', 'active', now()),
  ('Ogun', 'active', now())
on conflict (state) do update set
  status = excluded.status,
  launched_at = coalesce(public.platform_launch_states.launched_at, excluded.launched_at),
  updated_at = now();

insert into public.platform_settings (key, value)
values (
  'admin_site_controls',
  '{
    "bookings_enabled": true,
    "rider_onboarding_enabled": true,
    "wallet_topups_enabled": true,
    "withdrawals_enabled": true,
    "support_status": "open",
    "launch_headline": "FastFleet is live in Lagos and Ogun.",
    "launch_message": "Customers and riders in new states can join the waitlist while operations expand.",
    "wallet_policy": {
      "min_topup_ngn": 500,
      "min_withdrawal_ngn": 3000,
      "max_withdrawal_ngn": 200000,
      "payout_sla_hours": 24
    }
  }'::jsonb
)
on conflict (key) do nothing;

insert into storage.buckets (id, name, public)
values ('rider-documents', 'rider-documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('business-documents', 'business-documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('delivery-proofs', 'delivery-proofs', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Riders upload own documents" on storage.objects;
create policy "Riders upload own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'rider-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Riders and admins read rider documents" on storage.objects;
create policy "Riders and admins read rider documents"
  on storage.objects for select
  using (
    bucket_id = 'rider-documents'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.current_user_role() = 'admin'
    )
  );

drop policy if exists "Businesses upload own documents" on storage.objects;
create policy "Businesses upload own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'business-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Businesses and admins read business documents" on storage.objects;
create policy "Businesses and admins read business documents"
  on storage.objects for select
  using (
    bucket_id = 'business-documents'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.current_user_role() = 'admin'
    )
  );

drop policy if exists "Assigned riders upload delivery proofs" on storage.objects;
create policy "Assigned riders upload delivery proofs"
  on storage.objects for insert
  with check (
    bucket_id = 'delivery-proofs'
    and exists (
      select 1 from public.rider_profiles rp
      where rp.user_id = auth.uid()
        and rp.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "Delivery proofs are readable by signed in users" on storage.objects;
create policy "Delivery proofs are readable by signed in users"
  on storage.objects for select
  using (bucket_id = 'delivery-proofs' and auth.uid() is not null);

do $$ begin
  alter publication supabase_realtime add table public.deliveries;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.delivery_events;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.rider_locations;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.delivery_locations;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

-- Legacy compatibility for the original static HTML pages.
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  account_type text default 'customer',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_orders (
  id bigint generated by default as identity primary key,
  order_code text unique not null,
  user_id uuid references auth.users(id) on delete cascade,
  user_email text,
  customer_name text not null,
  customer_phone text not null,
  recipient_name text not null,
  recipient_phone text not null,
  pickup_address text not null,
  dropoff_address text not null,
  pickup_note text,
  package_type text,
  vehicle_type text not null,
  delivery_speed text not null,
  payment_method text,
  distance_km numeric,
  price_ngn numeric,
  eta_minutes integer,
  status text default 'Order received',
  courier_name text,
  courier_phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_profiles enable row level security;
alter table public.delivery_orders enable row level security;

drop policy if exists "Legacy profiles are readable by owner" on public.user_profiles;
create policy "Legacy profiles are readable by owner"
  on public.user_profiles for select
  using (auth.uid() = id or public.current_user_role() = 'admin');

drop policy if exists "Legacy profiles are inserted by owner" on public.user_profiles;
create policy "Legacy profiles are inserted by owner"
  on public.user_profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Legacy profiles are updated by owner" on public.user_profiles;
create policy "Legacy profiles are updated by owner"
  on public.user_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Legacy orders are readable by owner" on public.delivery_orders;
create policy "Legacy orders are readable by owner"
  on public.delivery_orders for select
  using (auth.uid() = user_id or public.current_user_role() = 'admin');

drop policy if exists "Legacy orders are inserted by owner" on public.delivery_orders;
create policy "Legacy orders are inserted by owner"
  on public.delivery_orders for insert
  with check (auth.uid() = user_id);

drop policy if exists "Legacy orders are updated by owner" on public.delivery_orders;
create policy "Legacy orders are updated by owner"
  on public.delivery_orders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists delivery_orders_user_id_idx on public.delivery_orders(user_id);
create index if not exists delivery_orders_order_code_idx on public.delivery_orders(order_code);
