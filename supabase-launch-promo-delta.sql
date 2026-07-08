-- FastFleets 360 launch promo delta.
-- Run this in Supabase SQL Editor before deploying/testing the first-150 promo.

create extension if not exists pgcrypto;

create table if not exists public.promo_campaigns (
  key text primary key,
  title text not null,
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'ended')),
  enrollment_limit integer not null default 150,
  max_redemptions_per_user integer not null default 2,
  discount_percent numeric(5,2) not null default 50,
  discount_cap_ngn numeric not null default 1500,
  waive_platform_fee boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.promo_campaigns (
  key,
  title,
  status,
  enrollment_limit,
  max_redemptions_per_user,
  discount_percent,
  discount_cap_ngn,
  waive_platform_fee,
  metadata
)
values (
  'launch_first_150',
  'First 150 FastFleets 360 users',
  'active',
  150,
  2,
  50,
  1500,
  true,
  '{"benefits":["Zero platform fee on eligible launch deliveries","50% off first two bike-size deliveries","Discount capped at NGN 1500 per delivery"]}'::jsonb
)
on conflict (key) do update set
  title = excluded.title,
  enrollment_limit = excluded.enrollment_limit,
  max_redemptions_per_user = excluded.max_redemptions_per_user,
  discount_percent = excluded.discount_percent,
  discount_cap_ngn = excluded.discount_cap_ngn,
  waive_platform_fee = excluded.waive_platform_fee,
  metadata = public.promo_campaigns.metadata || excluded.metadata,
  updated_at = now();

drop trigger if exists promo_campaigns_set_updated_at on public.promo_campaigns;
create trigger promo_campaigns_set_updated_at
before update on public.promo_campaigns
for each row execute function public.set_updated_at();

create table if not exists public.promo_enrollments (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null references public.promo_campaigns(key) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  enrollment_rank integer,
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  announcement_seen_at timestamptz,
  redemption_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_key, user_id),
  unique (campaign_key, enrollment_rank)
);

drop trigger if exists promo_enrollments_set_updated_at on public.promo_enrollments;
create trigger promo_enrollments_set_updated_at
before update on public.promo_enrollments
for each row execute function public.set_updated_at();

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null references public.promo_campaigns(key) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  delivery_id uuid references public.deliveries(id) on delete set null,
  redemption_slot integer not null check (redemption_slot between 1 and 2),
  status text not null default 'redeemed' check (status in ('pending', 'redeemed', 'void')),
  original_total_ngn numeric not null default 0,
  final_total_ngn numeric not null default 0,
  delivery_discount_ngn numeric not null default 0,
  platform_fee_discount_ngn numeric not null default 0,
  total_discount_ngn numeric not null default 0,
  redeemed_at timestamptz,
  voided_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_id),
  unique (campaign_key, user_id, redemption_slot)
);

drop trigger if exists promo_redemptions_set_updated_at on public.promo_redemptions;
create trigger promo_redemptions_set_updated_at
before update on public.promo_redemptions
for each row execute function public.set_updated_at();

create index if not exists promo_campaigns_status_idx on public.promo_campaigns(status);
create index if not exists promo_enrollments_user_idx on public.promo_enrollments(user_id, campaign_key);
create index if not exists promo_enrollments_rank_idx on public.promo_enrollments(campaign_key, enrollment_rank);
create index if not exists promo_redemptions_user_idx on public.promo_redemptions(user_id, campaign_key, status);
create index if not exists promo_redemptions_delivery_idx on public.promo_redemptions(delivery_id);

alter table public.promo_campaigns enable row level security;
alter table public.promo_enrollments enable row level security;
alter table public.promo_redemptions enable row level security;

drop policy if exists "Active promo campaigns are readable" on public.promo_campaigns;
create policy "Active promo campaigns are readable"
  on public.promo_campaigns for select
  using (status = 'active' or public.current_user_role() = 'admin');

drop policy if exists "Admins manage promo campaigns" on public.promo_campaigns;
create policy "Admins manage promo campaigns"
  on public.promo_campaigns for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "Users read own promo enrollments" on public.promo_enrollments;
create policy "Users read own promo enrollments"
  on public.promo_enrollments for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Admins manage promo enrollments" on public.promo_enrollments;
create policy "Admins manage promo enrollments"
  on public.promo_enrollments for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "Users read own promo redemptions" on public.promo_redemptions;
create policy "Users read own promo redemptions"
  on public.promo_redemptions for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Admins manage promo redemptions" on public.promo_redemptions;
create policy "Admins manage promo redemptions"
  on public.promo_redemptions for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
