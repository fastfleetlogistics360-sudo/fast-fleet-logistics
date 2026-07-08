-- FastFleets 360 Play Store readiness database delta.
-- Run this file instead of the full schema when applying the latest
-- push-notification and review-flow database changes to an existing project.

create extension if not exists pgcrypto;

create or replace function public.current_request_has_kyc_review_privilege()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_user in ('postgres', 'supabase_admin')
    or session_user in ('postgres', 'supabase_admin')
    or coalesce(auth.role(), '') = 'service_role'
    or public.current_user_role() = 'admin'
    or public.current_user_is_admin();
$$;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb,
  platform text not null default 'web',
  provider text not null default 'web_push',
  token text,
  device_id text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.push_subscriptions
  add column if not exists platform text not null default 'web',
  add column if not exists provider text not null default 'web_push',
  add column if not exists token text,
  add column if not exists device_id text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  unique_review_key text not null unique,
  reviewer_id uuid references public.users(id) on delete set null,
  reviewer_role text not null check (reviewer_role in ('customer', 'rider', 'business')),
  subject_type text not null check (subject_type in ('customer_delivery', 'rider_delivery', 'business_order')),
  delivery_id uuid references public.deliveries(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  target_user_id uuid references public.users(id) on delete set null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  target_rider_profile_id uuid references public.rider_profiles(id) on delete set null,
  target_business_profile_id uuid references public.business_profiles(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  improvement_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.reviews
  add column if not exists unique_review_key text,
  add column if not exists reviewer_id uuid references public.users(id) on delete set null,
  add column if not exists reviewer_role text,
  add column if not exists subject_type text,
  add column if not exists delivery_id uuid references public.deliveries(id) on delete set null,
  add column if not exists order_id uuid references public.orders(id) on delete set null,
  add column if not exists target_user_id uuid references public.users(id) on delete set null,
  add column if not exists target_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists target_rider_profile_id uuid references public.rider_profiles(id) on delete set null,
  add column if not exists target_business_profile_id uuid references public.business_profiles(id) on delete set null,
  add column if not exists rating integer,
  add column if not exists improvement_note text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.reviews add constraint reviews_unique_review_key_unique unique (unique_review_key);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.reviews add constraint reviews_rating_check check (rating between 1 and 5);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.reviews add constraint reviews_reviewer_role_check check (reviewer_role in ('customer', 'rider', 'business'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.reviews add constraint reviews_subject_type_check check (subject_type in ('customer_delivery', 'rider_delivery', 'business_order'));
exception when duplicate_object then null;
end $$;

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
before update on public.reviews
for each row execute function public.set_updated_at();

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id, updated_at desc);
create index if not exists push_subscriptions_provider_idx on public.push_subscriptions(provider, platform);
create index if not exists reviews_reviewer_idx on public.reviews(reviewer_id, created_at desc);
create index if not exists reviews_subject_idx on public.reviews(subject_type, created_at desc);
create index if not exists reviews_rating_idx on public.reviews(rating, created_at desc);
create index if not exists reviews_delivery_idx on public.reviews(delivery_id) where delivery_id is not null;
create index if not exists reviews_order_idx on public.reviews(order_id) where order_id is not null;

alter table public.push_subscriptions enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions"
  on public.push_subscriptions for all
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Review owners and admins manage reviews" on public.reviews;
create policy "Review owners and admins manage reviews"
  on public.reviews for all
  using (reviewer_id = auth.uid() or public.current_user_role() = 'admin')
  with check (reviewer_id = auth.uid() or public.current_user_role() = 'admin');
