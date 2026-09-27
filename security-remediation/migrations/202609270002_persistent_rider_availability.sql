-- Persistent rider availability uses the existing public.rider_profiles.online
-- column. It is already account-owned and defaults safely to false, so no
-- backfill is required. This additive table makes delivery-offer notifications
-- idempotent without changing availability, assignment, or payout records.
begin;

create table if not exists public.rider_delivery_notifications (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  rider_profile_id uuid not null references public.rider_profiles(id) on delete cascade,
  notification_type text not null default 'delivery_opportunity',
  created_at timestamptz not null default now(),
  unique (delivery_id, rider_profile_id, notification_type)
);

create index if not exists rider_delivery_notifications_rider_created_idx
  on public.rider_delivery_notifications (rider_profile_id, created_at desc);

alter table public.rider_delivery_notifications enable row level security;

-- No browser access is needed. The authenticated rider-facing route uses the
-- server service role after it has authenticated and evaluated eligibility.
revoke all on table public.rider_delivery_notifications from anon, authenticated;

commit;
